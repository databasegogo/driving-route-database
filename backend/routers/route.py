from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
import json

from database import get_db
from utils.auth import get_current_user

router = APIRouter(prefix="/route", tags=["route"])

# ── 常數設定 ──────────────────────────────────────────────────────

RISK_WEIGHT  = {"BEGINNER": 80, "NORMAL": 40, "EXPERIENCED": 10}
SCORE_WEIGHT = {"BEGINNER": 1,  "NORMAL": 2,  "EXPERIENCED": 3}
LEVEL_ORDER  = {"BEGINNER": 1,  "NORMAL": 2,  "EXPERIENCED": 3}
LEVEL_CODE   = {1: "BEGINNER",  2: "NORMAL",  3: "EXPERIENCED"}
BUFFER_M     = 5000   # 起終點之間 BBOX 擴張緩衝（公尺），之後可調整


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
    base_expr：正常情況下的 cost 計算式（字串）
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

        # 3. 查最近節點（KNN 直接找最近頂點，取前 5 個候選）
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

        # 從候選節點中找第一對可連通的組合
        start_node, end_node = start_candidates[0], end_candidates[0]

        # 4. 建立 Dijkstra 內層 SQL（數值用 f-string，已由 Pydantic float 驗證過）
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

        dijkstra_sql = f"""
            SELECT
                d.seq,
                d.edge,
                r.name                                AS road_name,
                re.length                             AS segment_distance_m,
                re.cost                               AS segment_base_cost,
                COALESCE(ers.risk_score, 0)           AS segment_risk_score,
                (re.cost + COALESCE(ers.risk_score, 0) * {risk_weight}) AS segment_final_cost,
                ST_AsGeoJSON(re.geom)                 AS geom_json
            FROM pgr_dijkstra(%s, %s, %s, directed := false) d
            JOIN road_edge re  ON d.edge = re.edge_id
            JOIN road r        ON re.road_id = r.road_id
            LEFT JOIN edge_risk_score ers ON re.edge_id = ers.edge_id
            WHERE d.edge > 0
            ORDER BY d.seq
        """

        # debug
        print(f"start_node={start_node}, end_node={end_node}")
        cur.execute(f"SELECT COUNT(*) FROM ({inner_sql}) AS t")
        print(f"BBOX edge count: {cur.fetchone()[0]}")
        # end debug
        # 嘗試所有候選節點組合，找到第一個有路的配對
        segments = []
        for s_node in start_candidates:
            for e_node in end_candidates:
                if s_node == e_node:
                    continue
                cur.execute(dijkstra_sql, (inner_sql, s_node, e_node))
                segments = cur.fetchall()
                if segments:
                    start_node, end_node = s_node, e_node
                    break
            if segments:
                break

        if not segments:
            raise HTTPException(422, "NO_PATH_FOUND")

        # 5. 計算彙總數值
        total_distance  = sum(s[3] for s in segments)
        total_base_cost = sum(s[4] for s in segments)
        total_risk      = sum(s[5] for s in segments)
        total_final     = sum(s[6] for s in segments)

        # 6. 距離上限檢查（從偏好設定取）
        cur.execute(
            "SELECT max_distance_m FROM user_route_preference WHERE user_id = %s",
            (user_id,)
        )
        pref = cur.fetchone()
        max_dist = pref[0] if pref else None
        if max_dist and total_distance > max_dist:
            raise HTTPException(422, "DISTANCE_EXCEEDED")

        # 7. 存入 route_request
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

        # 8. 存入 route
        route_name = f"{req.selected_difficulty} 路線"
        # 預估時間（秒）= 距離 ÷ 平均速度 30 km/h，並保留 20% 緩衝
        avg_speed_m_per_sec = 30 * 1000 / 3600   # 30 km/h → 8.33 m/s
        estimated_duration_sec = int(total_distance / avg_speed_m_per_sec * 1.2)

        cur.execute("""
            INSERT INTO route
              (request_id, route_name, total_distance_m, total_base_cost,
               total_risk_score, total_final_cost, estimated_duration_sec)
            VALUES (%s, %s, %s, %s, %s, %s, %s)
            RETURNING route_id
        """, (request_id, route_name, total_distance, total_base_cost,
              total_risk, total_final, estimated_duration_sec))
        route_id = cur.fetchone()[0]

        # 9. 存入 route_segment
        for seg in segments:
            cur.execute("""
                INSERT INTO route_segment
                  (route_id, sequence_order, edge_id,
                   segment_distance_m, segment_base_cost,
                   segment_risk_score, segment_final_cost)
                VALUES (%s, %s, %s, %s, %s, %s, %s)
            """, (route_id, seg[0], seg[1], seg[3], seg[4], seg[5], seg[6]))

        conn.commit()

        # 10. 組 GeoJSON 回傳
        features = []
        for seg in segments:
            geom = json.loads(seg[7]) if seg[7] else None
            features.append({
                "type": "Feature",
                "geometry": geom,
                "properties": {
                    "seq":        seg[0],
                    "road_name":  seg[2],
                    "distance_m": round(seg[3], 2),
                    "risk_score": round(seg[5], 2),
                    "final_cost": round(seg[6], 2),
                }
            })

        estimated_score = int(total_distance / 1000) * SCORE_WEIGHT[req.selected_difficulty]

        return {
            "route_id":               route_id,
            "total_distance_m":       round(total_distance, 2),
            "total_risk_score":       round(total_risk, 2),
            "total_final_cost":       round(total_final, 2),
            "estimated_score":        estimated_score,
            "estimated_duration_sec": estimated_duration_sec,
            "segments":               {"type": "FeatureCollection", "features": features}
        }

    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(500, str(e))
    finally:
        cur.close()
        conn.close()



@router.get("/debug/check")
def debug_check(
    start_lng: float = 121.2978859,
    start_lat: float = 25.0378064,
    end_lng:   float = 121.3006321,
    end_lat:   float = 25.0390930,
    current_user: dict = Depends(get_current_user)
):
    conn = get_db()
    cur  = conn.cursor()
    try:
        cur.execute("""
            SELECT id FROM road_edges_guishan_vertices_pgr
            ORDER BY the_geom <-> ST_SetSRID(ST_Point(%s, %s), 4326) LIMIT 1
        """, (start_lng, start_lat))
        start_node = cur.fetchone()
        cur.execute("""
            SELECT id FROM road_edges_guishan_vertices_pgr
            ORDER BY the_geom <-> ST_SetSRID(ST_Point(%s, %s), 4326) LIMIT 1
        """, (end_lng, end_lat))
        end_node = cur.fetchone()
        cur.execute(f"""
            SELECT COUNT(*) FROM road_edge re
            WHERE re.geom && ST_Buffer(
                ST_MakeLine(
                    ST_SetSRID(ST_Point({start_lng}, {start_lat}), 4326),
                    ST_SetSRID(ST_Point({end_lng}, {end_lat}), 4326)
                )::geography, {BUFFER_M}
            )::geometry
        """)
        edge_count = cur.fetchone()
        return {
            "start_node": start_node[0] if start_node else None,
            "end_node": end_node[0] if end_node else None,
            "bbox_edge_count": edge_count[0] if edge_count else 0,
        }
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
        cur.execute("""
            SELECT route_id, request_id, route_name,
                   total_distance_m, total_base_cost,
                   total_risk_score, total_final_cost
            FROM route
            WHERE route_id = %s
        """, (route_id,))
        row = cur.fetchone()
        if not row:
            raise HTTPException(404, "ROUTE_NOT_FOUND")

        return {
            "route_id":         row[0],
            "request_id":       row[1],
            "route_name":       row[2],
            "total_distance_m": row[3],
            "total_base_cost":  row[4],
            "total_risk_score": row[5],
            "total_final_cost": row[6],
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))
    finally:
        cur.close()
        conn.close()