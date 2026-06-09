from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from collections import defaultdict
import json
import math
import logging

from database import get_db
from utils.auth import get_current_user
from constants import SCORE_WEIGHT, LEVEL_ORDER, LEVEL_CODE

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/route", tags=["route"])

# ── 常數設定 ──────────────────────────────────────────────────────

# risk_score 實際範圍 0~2952，平均約 17，road_edge.cost 單位為公尺。
# 用 LEAST(risk_score, 50) 限制單邊最大影響：
#   BEGINNER：高風險路段 cost 最多 +50m，中強迴避（不會繞超過 50m × 邊數 的大圈）
#   NORMAL  ：高風險路段 cost 最多 +25m，輕度迴避
#   EXPERIENCED：高風險路段 cost 最多 +5m，幾乎忽略風險
RISK_WEIGHT  = {"BEGINNER": 1, "NORMAL": 0.5, "EXPERIENCED": 0.1}
# SCORE_WEIGHT / LEVEL_ORDER / LEVEL_CODE → 從 constants.py 匯入，不在此重複定義

DANGER_THRESHOLD_MULTIPLIER = 1.5


# ── Request schema ────────────────────────────────────────────────

class RouteRequest(BaseModel):
    start_lng: float
    start_lat: float
    end_lng:   float
    end_lat:   float
    selected_difficulty: str          # "BEGINNER" / "NORMAL" / "EXPERIENCED"
    avoid_bridge: bool = False
    avoid_tunnel: bool = False
    max_distance_m: int | None = None  # None = 不限距離


class SaveSegmentData(BaseModel):
    seq:        int
    edge_id:    int
    distance_m: float
    base_cost:  float = 0.0
    risk_score: float = 0.0
    final_cost: float = 0.0


class SaveRouteBody(BaseModel):
    start_lat:              float
    start_lng:              float
    end_lat:                float
    end_lng:                float
    selected_difficulty:    str
    avoid_bridge:           bool = False
    avoid_tunnel:           bool = False
    max_distance_m:         int | None = None
    route_name:             str
    total_distance_m:       float
    total_base_cost:        float = 0.0
    total_risk_score:       float = 0.0
    total_final_cost:       float = 0.0
    estimated_duration_sec: int
    segments:               list[SaveSegmentData]
    start_name:             str | None = None   # 起點地名（前端反地理編碼結果）
    end_name:               str | None = None   # 終點地名


# ── 工具函式 ──────────────────────────────────────────────────────

def build_cost_expr(base_expr: str, avoid_bridge: bool, avoid_tunnel: bool) -> str:
    """
    根據 avoid_bridge / avoid_tunnel 建立 CASE WHEN cost 表達式。
    """
    conditions = []
    if avoid_bridge:
        conditions.append("r.bridge = 'T'")
    if avoid_tunnel:
        conditions.append("r.tunnel = 'T'")

    if conditions:
        when_clause = " OR ".join(conditions)
        return f"CASE WHEN {when_clause} THEN 999999 ELSE {base_expr} END"
    return base_expr


def jaccard_similarity(a: frozenset, b: frozenset) -> float:
    """計算兩條路線的邊重疊比例（0 = 完全不同，1 = 完全相同）"""
    union = len(a | b)
    return len(a & b) / union if union > 0 else 1.0


def mark_dangerous_segments(segments: list) -> list:
    scores = [s["risk_score"] for s in segments if s["risk_score"] > 0]
    if not scores:
        for s in segments:
            s["is_dangerous"] = False
        return segments
    avg = sum(scores) / len(scores)
    threshold = avg * DANGER_THRESHOLD_MULTIPLIER
    for s in segments:
        s["is_dangerous"] = s["risk_score"] > threshold
    return segments


# ── 端點 ──────────────────────────────────────────────────────────

@router.post("/plan")
def plan_route(req: RouteRequest, current_user: dict = Depends(get_current_user)):
    conn = get_db()
    cur  = conn.cursor()
    try:
        user_id = current_user["user_id"]

        # 1. 查使用者等級
        cur.execute(
            "SELECT user_level_id FROM app_user WHERE user_id = %s",
            (user_id,)
        )
        row = cur.fetchone()
        if not row:
            raise HTTPException(404, "USER_NOT_FOUND")
        user_level_id   = row[0]
        user_level_code = LEVEL_CODE[user_level_id]

        # 2. 驗證難度不超過使用者等級
        if LEVEL_ORDER[req.selected_difficulty] > LEVEL_ORDER[user_level_code]:
            raise HTTPException(400, "DIFFICULTY_TOO_HIGH")

        risk_weight = RISK_WEIGHT[req.selected_difficulty]

        # 2b. 起終點直線距離最短限制（< 150 m 無法規劃有意義的練習路線）
        _dlat = math.radians(req.end_lat - req.start_lat)
        _dlng = math.radians(req.end_lng - req.start_lng)
        _a    = (math.sin(_dlat / 2) ** 2
                 + math.cos(math.radians(req.start_lat))
                 * math.cos(math.radians(req.end_lat))
                 * math.sin(_dlng / 2) ** 2)
        straight_line_m = 6_371_000 * 2 * math.asin(math.sqrt(_a))
        if straight_line_m < 150:
            raise HTTPException(422, "START_END_TOO_CLOSE")

        # 3. 查最近節點（改良版）
        #    舊做法：找距離點擊座標最近的 vertex → vertex 是交叉口，可能距點擊點幾百公尺遠
        #    新做法：
        #      a. KNN 取最近 50 條邊，篩選 source/target 都在 main_component_nodes 的邊
        #         （過濾掉步道、腳踏車道、孤立路等不可路由的邊）
        #      b. 取其 source/target 作為候選節點 → 這才是正確的路由入口節點
        #      c. 若無結果（理論上不會），回退至最近 vertex
        find_node_sql = """
            WITH near_routable AS (
                -- GiST 掃描前 200 條最近邊，再篩選主連通分量內的可路由邊
                -- (200 與 snap 端點一致；步道/行人路密集區前 50 條可能全不在主分量)
                SELECT source, target, geom
                FROM (
                    SELECT source, target, geom
                    FROM road_edges_guishan
                    ORDER BY geom <-> ST_SetSRID(ST_Point(%s, %s), 4326)
                    LIMIT 200
                ) candidates
                WHERE source IN (SELECT node FROM main_component_nodes)
                  AND target IN (SELECT node FROM main_component_nodes)
                ORDER BY geom <-> ST_SetSRID(ST_Point(%s, %s), 4326)
                LIMIT 5
            ),
            edge_nodes AS (
                SELECT source AS nid FROM near_routable
                UNION
                SELECT target AS nid FROM near_routable
            )
            SELECT v.id
            FROM road_edges_guishan_vertices_pgr v
            JOIN edge_nodes en ON v.id = en.nid
            ORDER BY v.the_geom <-> ST_SetSRID(ST_Point(%s, %s), 4326)
            LIMIT 6
        """
        fallback_sql = """
            SELECT v.id
            FROM road_edges_guishan_vertices_pgr v
            WHERE v.id IN (SELECT node FROM main_component_nodes)
            ORDER BY v.the_geom <-> ST_SetSRID(ST_Point(%s, %s), 4326)
            LIMIT 5
        """

        cur.execute(find_node_sql, (req.start_lng, req.start_lat,
                                    req.start_lng, req.start_lat,
                                    req.start_lng, req.start_lat))
        start_candidates = [r[0] for r in cur.fetchall()]
        if not start_candidates:
            cur.execute(fallback_sql, (req.start_lng, req.start_lat))
            start_candidates = [r[0] for r in cur.fetchall()]
        if not start_candidates:
            raise HTTPException(422, "NODE_NOT_FOUND")

        cur.execute(find_node_sql, (req.end_lng, req.end_lat,
                                    req.end_lng, req.end_lat,
                                    req.end_lng, req.end_lat))
        end_candidates = [r[0] for r in cur.fetchall()]
        if not end_candidates:
            cur.execute(fallback_sql, (req.end_lng, req.end_lat))
            end_candidates = [r[0] for r in cur.fetchall()]
        if not end_candidates:
            raise HTTPException(422, "NODE_NOT_FOUND")

        # 4. 建立 cost 表達式
        # LEAST(risk_score, 50)：限制單條邊的風險影響上限（risk_score 最高達 2952，不限制會讓演算法繞大圈）
        # risk_expr 單一定義，inner_sql / ksp_sql segment_final_cost 共用，避免三處不同步
        risk_expr = f"LEAST(COALESCE(ers.risk_score, 0), 50) * {risk_weight}"
        base_cost = f"(re.cost         + {risk_expr})"
        cost_expr = build_cost_expr(base_cost, req.avoid_bridge, req.avoid_tunnel)
        # 單行道保護：reverse_cost < 0（pgRouting 的單行道標記）不可被風險分數或 bridge 懲罰蓋掉
        # 先套 bridge/tunnel 懲罰，再用外層 CASE 確保 < 0 的值永遠保持原值
        rev_expr_inner = build_cost_expr(f"(re.reverse_cost + {risk_expr})", req.avoid_bridge, req.avoid_tunnel)
        rev_expr = f"CASE WHEN re.reverse_cost < 0 THEN re.reverse_cost ELSE {rev_expr_inner} END"

        # blocked 封鎖：cost 強制 999999，reverse_cost 保留 -1（單行道）或也設 999999
        final_cost_expr = f"CASE WHEN re.blocked THEN 999999 ELSE {cost_expr} END"
        final_rev_expr  = (
            f"CASE WHEN re.blocked THEN "
            f"  (CASE WHEN re.reverse_cost < 0 THEN re.reverse_cost ELSE 999999 END) "
            f"ELSE {rev_expr} END"
        )

        # avoid_bridge/tunnel 才需要 JOIN road（cost 表達式裡才有 r.bridge/r.tunnel）
        # 不需要時省掉 JOIN 可大幅加速 pgr_ksp 建圖
        # LEFT JOIN（不是 INNER JOIN）：虛擬橋接邊 road_id=9000001 不在 road 表
        # 若用 INNER JOIN，虛擬邊會被整個排除，導致 avoid_bridge/tunnel 時路網斷裂回 1082 節點
        road_join = (
            "LEFT JOIN road r ON r.road_id = re.road_id"
            if (req.avoid_bridge or req.avoid_tunnel) else ""
        )
        inner_sql = f"""
            SELECT
                re.edge_id AS id,
                re.source,
                re.target,
                {final_cost_expr} AS cost,
                {final_rev_expr}  AS reverse_cost
            FROM road_edge re
            {road_join}
            LEFT JOIN edge_risk_score ers ON re.edge_id = ers.edge_id
            WHERE re.source != re.target
        """

        # 5. pgr_ksp：回傳 k=6 條最短路徑（去重後最多保留 3 條）
        # 回傳欄位：[0]path_id [1]path_seq [2]edge  [3]road_name
        #           [4]distance_m [5]base_cost [6]risk_score [7]final_cost
        #           [8]geom_json [9]bridge [10]tunnel
        #           [11]seg_source [12]seg_target  ← 用於迴路偵測
        # geom_json：若 road_edge.geom 為 NULL（OSM 資料缺漏）
        #            → 用 source/target 頂點直線補救，避免前端渲染空缺斷點
        ksp_sql = f"""
            SELECT
                d.path_id,
                d.path_seq,
                d.edge,
                COALESCE(r.name, '(路網橋接)')                  AS road_name,
                re.length                                       AS segment_distance_m,
                re.cost                                         AS segment_base_cost,
                COALESCE(ers.risk_score, 0)                     AS segment_risk_score,
                (re.cost + {risk_expr}) AS segment_final_cost,
                COALESCE(
                    ST_AsGeoJSON(re.geom),
                    ST_AsGeoJSON(ST_SetSRID(
                        ST_MakeLine(vsrc.the_geom, vtgt.the_geom), 4326
                    ))
                )                                               AS geom_json,
                COALESCE(r.bridge, 'F')                         AS bridge,
                COALESCE(r.tunnel, 'F')                         AS tunnel,
                re.source                                       AS seg_source,
                re.target                                       AS seg_target
            FROM pgr_ksp(%s, %s, %s, 5, directed := true) d
            JOIN road_edge re  ON d.edge = re.edge_id
            LEFT JOIN road r   ON re.road_id = r.road_id
            LEFT JOIN edge_risk_score ers ON re.edge_id = ers.edge_id
            LEFT JOIN road_edges_guishan_vertices_pgr vsrc ON vsrc.id = re.source
            LEFT JOIN road_edges_guishan_vertices_pgr vtgt ON vtgt.id = re.target
            WHERE d.edge > 0
            ORDER BY d.path_id, d.path_seq
        """

        # 嘗試候選節點組合，找到第一個有路的配對
        # ★ 外層先固定 end_node（最靠近終點 snap），再換 start_node
        #   這樣當 start[0] == end[0] 時，保留 end[0] 不動，改用 start[1]
        #   避免 end 跑到次近路口造成路線「在終點附近繞一圈」
        all_rows = []
        start_node, end_node = start_candidates[0], end_candidates[0]

        # statement_timeout：單次 pgr_ksp 最多跑 10 秒，防止 CPU 爆衝
        # 使用 SET（session level）確保 rollback 後仍有效
        cur.execute("SET statement_timeout = '10000'")

        # 只嘗試前 3 個 end_candidates × 前 3 個 start_candidates（最多 9 對）
        # 避免 6×6=36 次全試導致等待過久；最近的候選對最可能成功
        for e_node in end_candidates[:3]:
            for s_node in start_candidates[:3]:
                if s_node == e_node:
                    continue
                try:
                    cur.execute(ksp_sql, (inner_sql, s_node, e_node))
                    all_rows = cur.fetchall()
                except Exception as ex:
                    # timeout 或其他 query 層級錯誤 → 此配對跳過，繼續試下一個
                    logger.warning(f"pgr_ksp({s_node},{e_node}) failed: {ex}")
                    conn.rollback()
                    all_rows = []
                if all_rows:
                    start_node, end_node = s_node, e_node
                    break
            if all_rows:
                break

        if not all_rows:
            raise HTTPException(422, "NO_PATH_FOUND")

        # 最短路徑（純距離 Dijkstra，不加風險權重）
        shortest_inner_sql = """
            SELECT re.edge_id AS id, re.source, re.target,
                   re.cost, re.reverse_cost
            FROM road_edge re
            WHERE re.source != re.target
        """
        shortest_sql = """
            SELECT d.seq, d.edge,
                   COALESCE(r.name, '(路網橋接)') AS road_name, re.length, re.cost,
                   COALESCE(ers.risk_score, 0) AS risk_score,
                   COALESCE(
                       ST_AsGeoJSON(re.geom),
                       ST_AsGeoJSON(ST_SetSRID(
                           ST_MakeLine(vsrc.the_geom, vtgt.the_geom), 4326
                       ))
                   ) AS geom_json
            FROM pgr_dijkstra(%s, %s, %s, directed := true) d
            JOIN road_edge re  ON d.edge = re.edge_id
            LEFT JOIN road r   ON re.road_id = r.road_id
            LEFT JOIN edge_risk_score ers ON re.edge_id = ers.edge_id
            LEFT JOIN road_edges_guishan_vertices_pgr vsrc ON vsrc.id = re.source
            LEFT JOIN road_edges_guishan_vertices_pgr vtgt ON vtgt.id = re.target
            WHERE d.edge > 0
            ORDER BY d.seq
        """
        cur.execute(shortest_sql, (shortest_inner_sql, start_node, end_node))
        shortest_rows = cur.fetchall()

        # 6. 按 path_id 分組 → {1: [rows...], 2: [rows...], ...}
        paths = defaultdict(list)
        for row in all_rows:
            paths[row[0]].append(row)

        # 6a. 迴路過濾：從 start_node 出發追蹤實際遍歷節點（考慮邊的雙向遍歷）
        # pgr_ksp undirected 模式下，一條邊可能被反向走（stored source→target，但實際走 target→source）
        # 需根據「進入節點」動態判斷「離開節點」，才能正確偵測重複節點
        non_loop_paths = {}
        for pid, segs in paths.items():
            cur_v   = start_node   # 從 pgr_ksp 起始節點出發
            visited = {cur_v}
            is_loop = False
            for seg in segs:
                src, tgt = seg[11], seg[12]
                if   src == cur_v: next_v = tgt
                elif tgt == cur_v: next_v = src
                else:
                    # 序列斷裂（橋接邊跳接或資料問題）
                    # 兩端都已拜訪 → 確認是迴路
                    if src in visited and tgt in visited:
                        is_loop = True
                        break
                    # 選取未拜訪端繼續（容錯跳接）
                    next_v = src if tgt in visited else tgt
                if next_v in visited:
                    is_loop = True
                    break
                visited.add(next_v)
                cur_v = next_v
            if not is_loop:
                non_loop_paths[pid] = segs
        paths = non_loop_paths

        # 6b. 多樣性去重：edge 重疊比例 > DIVERSITY_THRESHOLD 視為太相似，跳過
        # 0.5 = 允許最多 50% 邊重疊；值越小路線越不一樣，但越可能湊不到 3 條
        DIVERSITY_THRESHOLD = 0.5
        unique_path_ids = []
        seen_edge_sets  = []
        for pid in sorted(paths.keys()):
            edge_set = frozenset(seg[2] for seg in paths[pid])
            too_similar = any(
                jaccard_similarity(edge_set, seen) >= DIVERSITY_THRESHOLD
                for seen in seen_edge_sets
            )
            if not too_similar:
                unique_path_ids.append(pid)
                seen_edge_sets.append(edge_set)
            if len(unique_path_ids) == 3:
                break
        paths = {pid: paths[pid] for pid in unique_path_ids}

        # 7. 距離上限：優先用本次請求帶的值，沒帶才查使用者偏好設定
        if req.max_distance_m is not None:
            max_dist = req.max_distance_m
        else:
            cur.execute(
                "SELECT max_distance_m FROM user_route_preference WHERE user_id = %s",
                (user_id,)
            )
            pref     = cur.fetchone()
            max_dist = pref[0] if pref else None

        # 8. 組回傳結果
        #    延遲寫入：/route/plan 不存 DB，使用者點選「選擇此路線」後
        #    再由前端呼叫 POST /route/save 存入一條選定的路線。
        avg_speed_m_per_sec = 30 * 1000 / 3600   # 30 km/h → 8.33 m/s
        # 路線距離比例上限：不可超過直線距離 4 倍（避免演算法繞大圈）
        max_ratio = straight_line_m * 4 if straight_line_m > 0 else None
        routes_result = []
        rejected_by_max_dist  = 0   # 因使用者距離上限被排除的路線數
        rejected_by_max_ratio = 0   # 因 4× 比例上限被排除的路線數

        for path_id, segments in sorted(paths.items()):
            total_distance  = sum(seg[4] for seg in segments)
            total_base_cost = sum(seg[5] for seg in segments)
            total_risk      = sum(seg[6] for seg in segments)
            total_final     = sum(seg[7] for seg in segments)

            # 距離上限檢查（只跳過超限路線，不整個失敗）
            if max_dist and total_distance > max_dist:
                rejected_by_max_dist += 1
                continue

            # 路線距離比例檢查：超過直線距離 4 倍的路線跳過（排除繞大圈的異常路線）
            if max_ratio and total_distance > max_ratio:
                rejected_by_max_ratio += 1
                continue

            # 偵測此路線是否實際含有橋樑/隧道
            has_bridge = any(seg[9]  == 'T' for seg in segments)
            has_tunnel = any(seg[10] == 'T' for seg in segments)
            # 使用者要求避開，但路線仍含有 → 需警告
            constraint_relaxed = (req.avoid_bridge and has_bridge) or \
                                  (req.avoid_tunnel and has_tunnel)

            estimated_duration_sec = int(total_distance / avg_speed_m_per_sec * 1.2)
            _raw_score             = int(total_distance / 1000) * SCORE_WEIGHT[req.selected_difficulty]
            estimated_score        = _raw_score if _raw_score > 0 else (1 if total_distance > 0 else 0)
            route_name             = f"{req.selected_difficulty} 路線 {path_id}"

            # 組 GeoJSON（含 base_cost，供前端 /route/save 傳回存入 DB）
            features = []
            for seg in segments:
                geom = json.loads(seg[8]) if seg[8] else None
                features.append({
                    "type": "Feature",
                    "geometry": geom,
                    "properties": {
                        "edge_id":    seg[2],
                        "seq":        seg[1],
                        "road_name":  seg[3],
                        "distance_m": round(seg[4], 2),
                        "base_cost":  round(seg[5], 2),
                        "risk_score": round(seg[6], 2),
                        "final_cost": round(seg[7], 2),
                    }
                })

            routes_result.append({
                "route_id":               None,   # 尚未存入 DB，選擇後由 /route/save 回傳真實 id
                "route_name":             route_name,
                "total_distance_m":       round(total_distance, 2),
                "total_base_cost":        round(total_base_cost, 2),
                "total_risk_score":       round(total_risk, 2),
                "total_final_cost":       round(total_final, 2),
                "estimated_score":        estimated_score,
                "estimated_duration_sec": estimated_duration_sec,
                "has_bridge":             has_bridge,
                "has_tunnel":             has_tunnel,
                "constraint_relaxed":     constraint_relaxed,
                "segments":               {"type": "FeatureCollection", "features": features}
            })

        if not routes_result:
            # 區分錯誤原因：使用者設距離上限 vs 路線演算法繞大圈
            if rejected_by_max_dist > 0:
                raise HTTPException(422, "ALL_ROUTES_EXCEED_DISTANCE_LIMIT")
            raise HTTPException(422, "NO_PATH_FOUND")

        # 整理最短路徑（含危險路段標記）
        shortest_route = None
        if shortest_rows:
            seg_dicts = []
            for seg in shortest_rows:
                geom = json.loads(seg[6]) if seg[6] else None
                seg_dicts.append({
                    "edge_id":    seg[1],   # d.edge
                    "seq":        seg[0],
                    "road_name":  seg[2],
                    "distance_m": round(seg[3], 2),
                    "risk_score": round(seg[5], 2),
                    "geom":       geom,
                })
            seg_dicts = mark_dangerous_segments(seg_dicts)
            danger_scores = [s["risk_score"] for s in seg_dicts if s["risk_score"] > 0]
            avg_danger = sum(danger_scores) / len(danger_scores) if danger_scores else 0
            shortest_route = {
                "route_type":       "shortest",
                "total_distance_m": round(sum(s["distance_m"] for s in seg_dicts), 2),
                "total_risk_score": round(sum(s["risk_score"] for s in seg_dicts), 2),
                "danger_threshold": round(avg_danger * DANGER_THRESHOLD_MULTIPLIER, 2),
                "segments": {
                    "type": "FeatureCollection",
                    "features": [
                        {
                            "type": "Feature",
                            "geometry": s["geom"],
                            "properties": {
                                "edge_id":      s["edge_id"],
                                "seq":          s["seq"],
                                "road_name":    s["road_name"],
                                "distance_m":   s["distance_m"],
                                "risk_score":   s["risk_score"],
                                "is_dangerous": s["is_dangerous"],
                            }
                        }
                        for s in seg_dicts
                    ]
                }
            }

        # 查詢實際路由節點座標（pgr_ksp 起/終點路口），供前端 marker 定位
        # snap 點是「路段上的垂足」，routing node 是「路口交叉點」，兩者可能不同
        # 前端用 node coord 當 marker 才能和 route 線條終點完全吻合
        cur.execute("""
            SELECT ST_Y(the_geom) AS lat, ST_X(the_geom) AS lng
            FROM road_edges_guishan_vertices_pgr WHERE id = %s
        """, (start_node,))
        row = cur.fetchone()
        start_node_coord = [row[0], row[1]] if row else None

        cur.execute("""
            SELECT ST_Y(the_geom) AS lat, ST_X(the_geom) AS lng
            FROM road_edges_guishan_vertices_pgr WHERE id = %s
        """, (end_node,))
        row = cur.fetchone()
        end_node_coord = [row[0], row[1]] if row else None

        conn.commit()

        return {
            "routes":           routes_result,
            "shortest_route":   shortest_route,
            "start_node_coord": start_node_coord,   # 實際起點路口 [lat, lng]
            "end_node_coord":   end_node_coord,      # 實際終點路口 [lat, lng]
        }

    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(500, "INTERNAL_SERVER_ERROR")
    finally:
        cur.close()
        conn.close()


@router.post("/save")
def save_route(req: SaveRouteBody, current_user: dict = Depends(get_current_user)):
    """
    使用者在 RouteSelect 點擊「選擇此路線」時呼叫。
    - 先做去重複查詢：相同起終點（30 m 容差）+ 相同難度 + 相近路線距離（10 m 容差）
      → 若已存在，直接回傳舊 route_id（reused: true）
    - 若不存在，才建立 route_request → route → route_segment，回傳新 route_id
    """
    conn = get_db()
    cur  = conn.cursor()
    try:
        user_id     = current_user["user_id"]
        risk_weight = RISK_WEIGHT.get(req.selected_difficulty, 80)

        # 1. 取使用者等級 ID
        cur.execute(
            "SELECT user_level_id FROM app_user WHERE user_id = %s",
            (user_id,)
        )
        row = cur.fetchone()
        if not row:
            raise HTTPException(404, "USER_NOT_FOUND")
        user_level_id = row[0]

        # 2. 去重複：相同起終點 + 難度 + 距離 → 直接回傳已存在的 route_id
        cur.execute("""
            SELECT ro.route_id
            FROM route ro
            JOIN route_request rr ON ro.request_id = rr.request_id
            WHERE rr.user_id = %s
              AND ST_DWithin(
                    rr.start_geom::geography,
                    ST_SetSRID(ST_Point(%s, %s), 4326)::geography,
                    30
                  )
              AND ST_DWithin(
                    rr.end_geom::geography,
                    ST_SetSRID(ST_Point(%s, %s), 4326)::geography,
                    30
                  )
              AND rr.risk_weight   = %s
              AND rr.avoid_bridge  = %s
              AND rr.avoid_tunnel  = %s
              AND ABS(ro.total_distance_m - %s) < 10
            ORDER BY ro.route_id ASC
            LIMIT 1
        """, (
            user_id,
            req.start_lng, req.start_lat,
            req.end_lng,   req.end_lat,
            risk_weight, req.avoid_bridge, req.avoid_tunnel,
            req.total_distance_m
        ))
        existing = cur.fetchone()
        if existing:
            return {"route_id": existing[0], "reused": True}

        # 3. 找或建立 route_request（相同起終點 + 難度 → 共用同一個 request）
        cur.execute("""
            SELECT request_id FROM route_request
            WHERE user_id = %s
              AND ST_DWithin(
                    start_geom::geography,
                    ST_SetSRID(ST_Point(%s, %s), 4326)::geography,
                    30
                  )
              AND ST_DWithin(
                    end_geom::geography,
                    ST_SetSRID(ST_Point(%s, %s), 4326)::geography,
                    30
                  )
              AND risk_weight  = %s
              AND avoid_bridge = %s
              AND avoid_tunnel = %s
            ORDER BY request_id DESC
            LIMIT 1
        """, (
            user_id,
            req.start_lng, req.start_lat,
            req.end_lng,   req.end_lat,
            risk_weight, req.avoid_bridge, req.avoid_tunnel
        ))
        existing_req = cur.fetchone()

        if existing_req:
            request_id = existing_req[0]
        else:
            cur.execute("""
                INSERT INTO route_request
                  (user_id, user_level_id, start_lng, start_lat, end_lng, end_lat,
                   start_geom, end_geom, risk_weight, avoid_bridge, avoid_tunnel, max_distance_m,
                   start_name, end_name)
                VALUES (%s, %s, %s, %s, %s, %s,
                        ST_SetSRID(ST_Point(%s, %s), 4326),
                        ST_SetSRID(ST_Point(%s, %s), 4326),
                        %s, %s, %s, %s,
                        %s, %s)
                RETURNING request_id
            """, (
                user_id, user_level_id,
                req.start_lng, req.start_lat, req.end_lng, req.end_lat,
                req.start_lng, req.start_lat,
                req.end_lng,   req.end_lat,
                risk_weight, req.avoid_bridge, req.avoid_tunnel, req.max_distance_m,
                req.start_name, req.end_name
            ))
            request_id = cur.fetchone()[0]

        # 4. 存 route
        cur.execute("""
            INSERT INTO route
              (request_id, route_name, total_distance_m, total_base_cost,
               total_risk_score, total_final_cost, estimated_duration_sec)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            RETURNING route_id
        """, (
            request_id, req.route_name,
            req.total_distance_m, req.total_base_cost,
            req.total_risk_score, req.total_final_cost,
            req.estimated_duration_sec
        ))
        route_id = cur.fetchone()[0]

        # 5. 存 route_segment
        for seg in req.segments:
            cur.execute("""
                INSERT INTO route_segment
                  (route_id, sequence_order, edge_id,
                   segment_distance_m, segment_base_cost,
                   segment_risk_score, segment_final_cost)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
            """, (
                route_id, seg.seq, seg.edge_id,
                seg.distance_m, seg.base_cost,
                seg.risk_score, seg.final_cost
            ))

        conn.commit()
        return {"route_id": route_id, "reused": False}

    except HTTPException:
        raise
    except Exception:
        conn.rollback()
        raise HTTPException(500, "INTERNAL_SERVER_ERROR")
    finally:
        cur.close()
        conn.close()


@router.get("/snap")
def snap_to_road(lat: float, lng: float, current_user: dict = Depends(get_current_user)):
    """
    將座標吸附到最近「可路由」道路幾何上的垂足點（ST_ClosestPoint）。
    只吸附到 source/target 都在 main_component_nodes 的邊，
    排除步道、腳踏車道、孤立路等不在路由圖中的邊，
    確保 snap 結果與路由圖一致。
    """
    conn = get_db()
    cur  = conn.cursor()
    try:
        cur.execute("""
            WITH nearest_routable_edge AS (
                -- GiST 掃描最近 200 條邊，再篩選可路由邊（兩端節點都在主連通分量）
                -- 設 200 是因為某些區域近鄰全是步道/行人路，需要掃更多才能找到可路由車道
                SELECT re.geom
                FROM (
                    SELECT geom, source, target
                    FROM road_edges_guishan
                    ORDER BY geom <-> ST_SetSRID(ST_Point(%s, %s), 4326)
                    LIMIT 200
                ) re
                WHERE re.source IN (SELECT node FROM main_component_nodes)
                  AND re.target IN (SELECT node FROM main_component_nodes)
                ORDER BY re.geom <-> ST_SetSRID(ST_Point(%s, %s), 4326)
                LIMIT 1
            ),
            foot AS (
                -- 計算點擊點在 edge 幾何線上的垂足（最近投影點）
                SELECT ST_ClosestPoint(
                    ne.geom,
                    ST_SetSRID(ST_Point(%s, %s), 4326)
                ) AS closest_pt
                FROM nearest_routable_edge ne
            )
            SELECT
                ST_Y(foot.closest_pt)  AS snap_lat,
                ST_X(foot.closest_pt)  AS snap_lng,
                ST_Distance(
                    foot.closest_pt::geography,
                    ST_SetSRID(ST_Point(%s, %s), 4326)::geography
                ) AS dist_m
            FROM foot
        """, (lng, lat, lng, lat, lng, lat, lng, lat))
        row = cur.fetchone()
        if not row:
            raise HTTPException(422, "NODE_NOT_FOUND")
        return {
            "snap_lat": float(row[0]),
            "snap_lng": float(row[1]),
            "dist_m":   round(float(row[2]), 1),
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, "INTERNAL_SERVER_ERROR")
    finally:
        cur.close()
        conn.close()


@router.get("/{route_id}/coords")
def get_route_coords(route_id: int, current_user: dict = Depends(get_current_user)):
    """從 route_segment → road_edge 重建路線座標陣列，供前端縮圖/地圖輕量使用"""
    conn = get_db()
    cur  = conn.cursor()
    try:
        cur.execute("""
            SELECT
                COALESCE(
                    ST_AsGeoJSON(re.geom),
                    ST_AsGeoJSON(ST_MakeLine(vsrc.the_geom, vtgt.the_geom))
                ) AS geom_json
            FROM route_segment rs
            JOIN road_edge re ON rs.edge_id = re.edge_id
            LEFT JOIN road_edges_guishan_vertices_pgr vsrc ON re.source = vsrc.id
            LEFT JOIN road_edges_guishan_vertices_pgr vtgt ON re.target = vtgt.id
            WHERE rs.route_id = %s
            ORDER BY rs.sequence_order
        """, (route_id,))
        rows = cur.fetchall()
        if not rows:
            raise HTTPException(404, "ROUTE_NOT_FOUND")

        coords = []
        for (geom_json,) in rows:
            if not geom_json:
                continue
            geom = json.loads(geom_json)
            if geom["type"] == "LineString":
                for lng, lat in geom["coordinates"]:
                    coords.append([lat, lng])
            elif geom["type"] == "MultiLineString":
                for line in geom["coordinates"]:
                    for lng, lat in line:
                        coords.append([lat, lng])

        return {"route_id": route_id, "coords": coords}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))
    finally:
        cur.close()
        conn.close()


@router.get("/{route_id}")
def get_route(route_id: int, current_user: dict = Depends(get_current_user)):
    conn = get_db()
    cur  = conn.cursor()
    try:
        # 1. 路線基本資料
        cur.execute("""
            SELECT route_id, request_id, route_name,
                   total_distance_m, total_base_cost,
                   total_risk_score, total_final_cost, estimated_duration_sec
            FROM route
            WHERE route_id = %s
        """, (route_id,))
        row = cur.fetchone()
        if not row:
            raise HTTPException(404, "ROUTE_NOT_FOUND")

        # 2. 路段幾何（JOIN road_edge 取回 geom）
        # LEFT JOIN road：虛擬橋接邊 road_id=9000001 不在 road 表，INNER JOIN 會整行遺失
        # COALESCE geom：部分 OSM 邊 geom 為 NULL，用 source/target 頂點直線補
        cur.execute("""
            SELECT rs.sequence_order,
                   rs.edge_id,
                   COALESCE(r.name, '(路網橋接)')   AS road_name,
                   rs.segment_distance_m,
                   rs.segment_risk_score,
                   COALESCE(
                       ST_AsGeoJSON(re.geom),
                       ST_AsGeoJSON(ST_SetSRID(
                           ST_MakeLine(vsrc.the_geom, vtgt.the_geom), 4326
                       ))
                   )                                AS geom_json
            FROM route_segment rs
            JOIN  road_edge re  ON rs.edge_id  = re.edge_id
            LEFT JOIN road r    ON re.road_id   = r.road_id
            LEFT JOIN road_edges_guishan_vertices_pgr vsrc ON re.source = vsrc.id
            LEFT JOIN road_edges_guishan_vertices_pgr vtgt ON re.target = vtgt.id
            WHERE rs.route_id = %s
            ORDER BY rs.sequence_order
        """, (route_id,))

        features = []
        for seg in cur.fetchall():
            geom = json.loads(seg[5]) if seg[5] else None
            features.append({
                "type": "Feature",
                "geometry": geom,
                "properties": {
                    "edge_id":    seg[1],
                    "seq":        seg[0],
                    "road_name":  seg[2],
                    "distance_m": round(seg[3], 2),
                    "risk_score": round(seg[4], 2),
                }
            })

        return {
            "route_id":               row[0],
            "request_id":             row[1],
            "route_name":             row[2],
            "total_distance_m":       row[3],
            "total_base_cost":        row[4],
            "total_risk_score":       row[5],
            "total_final_cost":       row[6],
            "estimated_duration_sec": row[7],
            "segments": {"type": "FeatureCollection", "features": features},
        }

    except HTTPException:
        raise
    except Exception:
        raise HTTPException(500, "INTERNAL_SERVER_ERROR")
    finally:
        cur.close()
        conn.close()
