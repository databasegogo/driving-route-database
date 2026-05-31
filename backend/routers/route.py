from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from collections import defaultdict
import json

from database import get_db
from utils.auth import get_current_user

router = APIRouter(prefix="/route", tags=["route"])

# ── 常數設定 ──────────────────────────────────────────────────────

RISK_WEIGHT  = {"BEGINNER": 80, "NORMAL": 40, "EXPERIENCED": 10}
SCORE_WEIGHT = {"BEGINNER": 1,  "NORMAL": 2,  "EXPERIENCED": 3}
LEVEL_ORDER  = {"BEGINNER": 1,  "NORMAL": 2,  "EXPERIENCED": 3}
LEVEL_CODE   = {1: "BEGINNER",  2: "NORMAL",  3: "EXPERIENCED"}


# ── Request schema ────────────────────────────────────────────────

class RouteRequest(BaseModel):
    start_lng: float
    start_lat: float
    end_lng:   float
    end_lat:   float
    selected_difficulty: str   # "BEGINNER" / "NORMAL" / "EXPERIENCED"
    avoid_bridge: bool = False
    avoid_tunnel: bool = False


# ── 工具函式 ──────────────────────────────────────────────────────

def build_cost_expr(base_expr: str, avoid_bridge: bool, avoid_tunnel: bool) -> str:
    """
    根據 avoid_bridge / avoid_tunnel 建立 CASE WHEN cost 表達式。
    """
    conditions = []
    if avoid_bridge:
        conditions.append("(r.bridge IS NOT NULL AND r.bridge <> '')")
    if avoid_tunnel:
        conditions.append("(r.tunnel IS NOT NULL AND r.tunnel <> '')")

    if conditions:
        when_clause = " OR ".join(conditions)
        return f"CASE WHEN {when_clause} THEN 999999 ELSE {base_expr} END"
    return base_expr


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

        # 3. 查最近節點（KNN，取前 5 個候選）
        find_node_sql = """
            SELECT id
            FROM road_edges_guishan_vertices_pgr
            ORDER BY the_geom <-> ST_SetSRID(ST_Point(%s, %s), 4326)
            LIMIT 5
        """
        cur.execute(find_node_sql, (req.start_lng, req.start_lat))
        start_candidates = [r[0] for r in cur.fetchall()]
        if not start_candidates:
            raise HTTPException(422, "NODE_NOT_FOUND")

        cur.execute(find_node_sql, (req.end_lng, req.end_lat))
        end_candidates = [r[0] for r in cur.fetchall()]
        if not end_candidates:
            raise HTTPException(422, "NODE_NOT_FOUND")

        # 4. 建立 cost 表達式
        base_cost = f"(re.cost         + COALESCE(ers.risk_score, 0) * {risk_weight})"
        base_rev  = f"(re.reverse_cost + COALESCE(ers.risk_score, 0) * {risk_weight})"
        cost_expr = build_cost_expr(base_cost, req.avoid_bridge, req.avoid_tunnel)
        rev_expr  = build_cost_expr(base_rev,  req.avoid_bridge, req.avoid_tunnel)

        inner_sql = f"""
            SELECT
                re.edge_id AS id,
                re.source,
                re.target,
                {cost_expr} AS cost,
                {rev_expr}  AS reverse_cost
            FROM road_edge re
            JOIN road r ON r.road_id = re.road_id
            LEFT JOIN edge_risk_score ers ON re.edge_id = ers.edge_id
        """

        # 5. pgr_ksp：回傳 3 條最短路徑
        # 回傳欄位：[0]path_id [1]path_seq [2]edge [3]road_name
        #           [4]distance_m [5]base_cost [6]risk_score [7]final_cost [8]geom_json
        ksp_sql = f"""
            SELECT
                d.path_id,
                d.path_seq,
                d.edge,
                r.name                                          AS road_name,
                re.length                                       AS segment_distance_m,
                re.cost                                         AS segment_base_cost,
                COALESCE(ers.risk_score, 0)                     AS segment_risk_score,
                (re.cost + COALESCE(ers.risk_score, 0) * {risk_weight}) AS segment_final_cost,
                ST_AsGeoJSON(re.geom)                           AS geom_json
            FROM pgr_ksp(%s, %s, %s, 3, directed := false) d
            JOIN road_edge re  ON d.edge = re.edge_id
            JOIN road r        ON re.road_id = r.road_id
            LEFT JOIN edge_risk_score ers ON re.edge_id = ers.edge_id
            WHERE d.edge > 0
            ORDER BY d.path_id, d.path_seq
        """

        # 嘗試候選節點組合，找到第一個有路的配對
        all_rows = []
        start_node, end_node = start_candidates[0], end_candidates[0]
        for s_node in start_candidates:
            for e_node in end_candidates:
                if s_node == e_node:
                    continue
                cur.execute(ksp_sql, (inner_sql, s_node, e_node))
                all_rows = cur.fetchall()
                if all_rows:
                    start_node, end_node = s_node, e_node
                    break
            if all_rows:
                break

        if not all_rows:
            raise HTTPException(422, "NO_PATH_FOUND")

        # 6. 按 path_id 分組 → {1: [rows...], 2: [rows...], 3: [rows...]}
        paths = defaultdict(list)
        for row in all_rows:
            paths[row[0]].append(row)

        # 7. 查距離上限
        cur.execute(
            "SELECT max_distance_m FROM user_route_preference WHERE user_id = %s",
            (user_id,)
        )
        pref     = cur.fetchone()
        max_dist = pref[0] if pref else None

        # 8. 存入 route_request
        cur.execute("""
            INSERT INTO route_request
              (user_id, user_level_id, start_lng, start_lat, end_lng, end_lat,
               start_geom, end_geom, risk_weight, avoid_bridge, avoid_tunnel, max_distance_m)
            VALUES (%s, %s, %s, %s, %s, %s,
                    ST_SetSRID(ST_Point(%s, %s), 4326),
                    ST_SetSRID(ST_Point(%s, %s), 4326),
                    %s, %s, %s, %s)
            RETURNING request_id
        """, (
            user_id, user_level_id,
            req.start_lng, req.start_lat, req.end_lng, req.end_lat,
            req.start_lng, req.start_lat,
            req.end_lng,   req.end_lat,
            risk_weight, req.avoid_bridge, req.avoid_tunnel, max_dist
        ))
        request_id = cur.fetchone()[0]

        # 9. 為每條路徑存 route + route_segment，並組回傳結果
        avg_speed_m_per_sec = 30 * 1000 / 3600   # 30 km/h → 8.33 m/s
        routes_result = []

        for path_id, segments in sorted(paths.items()):
            total_distance  = sum(seg[4] for seg in segments)
            total_base_cost = sum(seg[5] for seg in segments)
            total_risk      = sum(seg[6] for seg in segments)
            total_final     = sum(seg[7] for seg in segments)

            # 距離上限檢查（只跳過超限路線，不整個失敗）
            if max_dist and total_distance > max_dist:
                continue

            estimated_duration_sec = int(total_distance / avg_speed_m_per_sec * 1.2)
            estimated_score        = int(total_distance / 1000) * SCORE_WEIGHT[req.selected_difficulty]
            route_name             = f"{req.selected_difficulty} 路線 {path_id}"

            # 存 route
            cur.execute("""
                INSERT INTO route
                  (request_id, route_name, total_distance_m, total_base_cost,
                   total_risk_score, total_final_cost, estimated_duration_sec)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
                RETURNING route_id
            """, (request_id, route_name, total_distance, total_base_cost,
                  total_risk, total_final, estimated_duration_sec))
            route_id = cur.fetchone()[0]

            # 存 route_segment
            for seg in segments:
                cur.execute("""
                    INSERT INTO route_segment
                      (route_id, sequence_order, edge_id,
                       segment_distance_m, segment_base_cost,
                       segment_risk_score, segment_final_cost)
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                """, (route_id, seg[1], seg[2], seg[4], seg[5], seg[6], seg[7]))

            # 組 GeoJSON
            features = []
            for seg in segments:
                geom = json.loads(seg[8]) if seg[8] else None
                features.append({
                    "type": "Feature",
                    "geometry": geom,
                    "properties": {
                        "seq":        seg[1],
                        "road_name":  seg[3],
                        "distance_m": round(seg[4], 2),
                        "risk_score": round(seg[6], 2),
                        "final_cost": round(seg[7], 2),
                    }
                })

            routes_result.append({
                "route_id":               route_id,
                "route_name":             route_name,
                "total_distance_m":       round(total_distance, 2),
                "total_risk_score":       round(total_risk, 2),
                "total_final_cost":       round(total_final, 2),
                "estimated_score":        estimated_score,
                "estimated_duration_sec": estimated_duration_sec,
                "segments":               {"type": "FeatureCollection", "features": features}
            })

        if not routes_result:
            raise HTTPException(422, "ALL_ROUTES_EXCEED_DISTANCE_LIMIT")

        conn.commit()

        return {
            "request_id": request_id,
            "routes":     routes_result   # 最多 3 條，前端顯示供使用者選擇
        }

    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(500, str(e))
    finally:
        cur.close()
        conn.close()


@router.get("/{route_id}")
def get_route(route_id: int, current_user: dict = Depends(get_current_user)):
    conn = get_db()
    cur  = conn.cursor()
    try:
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

        return {
            "route_id":               row[0],
            "request_id":             row[1],
            "route_name":             row[2],
            "total_distance_m":       row[3],
            "total_base_cost":        row[4],
            "total_risk_score":       row[5],
            "total_final_cost":       row[6],
            "estimated_duration_sec": row[7],
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))
    finally:
        cur.close()
        conn.close()
