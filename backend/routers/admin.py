from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional

from database import get_db
from utils.auth import get_current_user

router = APIRouter(prefix="/admin", tags=["admin"])


# ── GET /admin/users　取得所有使用者 ─────────────────────────────
@router.get("/users")
def get_all_users(current_user: dict = Depends(get_current_user)):
    conn = get_db()
    cur  = conn.cursor()
    try:
        cur.execute("""
            SELECT
                u.user_id,
                u.username,
                u.email,
                u.birth_date,
                u.license_date,
                u.total_score,
                u.role,
                ul.level_code,
                ul.user_level_id
            FROM app_user u
            JOIN user_level ul ON u.user_level_id = ul.user_level_id
            ORDER BY u.user_id
        """)
        rows = cur.fetchall()
        return [
            {
                "user_id":       row[0],
                "username":      row[1],
                "email":         row[2],
                "birth_date":    row[3].isoformat() if row[3] else None,
                "license_date":  row[4].isoformat() if row[4] else None,
                "total_score":   row[5],
                "role":          row[6],
                "level_code":    row[7],
                "user_level_id": row[8],
            }
            for row in rows
        ]
    except Exception as e:
        raise HTTPException(500, str(e))
    finally:
        cur.close()
        conn.close()


# ── GET /admin/routes　取得所有路線 ──────────────────────────────
@router.get("/routes")
def get_all_routes(current_user: dict = Depends(get_current_user)):
    conn = get_db()
    cur  = conn.cursor()
    try:
        cur.execute("""
            SELECT
                r.route_id,
                r.request_id,
                r.route_name,
                r.total_distance_m,
                r.total_base_cost,
                r.total_risk_score,
                r.total_final_cost,
                r.created_at,
                rq.user_id,
                rq.start_name,
                rq.end_name
            FROM route r
            JOIN route_request rq ON r.request_id = rq.request_id
            ORDER BY r.created_at DESC
        """)
        rows = cur.fetchall()
        return [
            {
                "route_id":         row[0],
                "request_id":       row[1],
                "route_name":       row[2],
                "total_distance_m": float(row[3]) if row[3] else 0,
                "total_base_cost":  float(row[4]) if row[4] else 0,
                "total_risk_score": float(row[5]) if row[5] else 0,
                "total_final_cost": float(row[6]) if row[6] else 0,
                "created_at":       row[7].isoformat() if row[7] else None,
                "user_id":          row[8],
                "start_name":       row[9] or "",
                "end_name":         row[10] or "",
            }
            for row in rows
        ]
    except Exception as e:
        raise HTTPException(500, str(e))
    finally:
        cur.close()
        conn.close()


# ── GET /admin/practice　取得所有練習紀錄 ────────────────────────
@router.get("/practice")
def get_all_practice(current_user: dict = Depends(get_current_user)):
    conn = get_db()
    cur  = conn.cursor()
    try:
        cur.execute("""
            SELECT
                ph.practice_id,
                ph.user_id,
                ph.route_id,
                ph.practice_time,
                ph.status,
                ph.selected_difficulty,
                ph.score_earned,
                r.total_distance_m,
                r.route_name
            FROM user_practice_history ph
            JOIN route r ON ph.route_id = r.route_id
            ORDER BY ph.practice_time DESC
        """)
        rows = cur.fetchall()
        return {
            "total": len(rows),
            "history": [
                {
                    "practice_id":         row[0],
                    "user_id":             row[1],
                    "route_id":            row[2],
                    "practice_time":       row[3].isoformat() if row[3] else None,
                    "status":              row[4],
                    "selected_difficulty": row[5],
                    "score_earned":        row[6],
                    "total_distance_m":    float(row[7]) if row[7] else None,
                    "route_name":          row[8],
                }
                for row in rows
            ]
        }
    except Exception as e:
        raise HTTPException(500, str(e))
    finally:
        cur.close()
        conn.close()


# ── PATCH /admin/users/{user_id}/level　手動調整等級 ─────────────
LEVEL_MIN_SCORE = {1: 0, 2: 150, 3: 300}  # BEGINNER, NORMAL, EXPERIENCED

class AdminLevelUpdate(BaseModel):
    user_level_id: int   # 1=BEGINNER  2=NORMAL  3=EXPERIENCED


@router.patch("/users/{user_id}/level")
def admin_update_level(
    user_id: int,
    req: AdminLevelUpdate,
    current_user: dict = Depends(get_current_user),
):
    if req.user_level_id not in (1, 2, 3):
        raise HTTPException(400, "INVALID_LEVEL_ID")

    conn = get_db()
    cur  = conn.cursor()
    try:
        cur.execute(
            "SELECT user_level_id, total_score FROM app_user WHERE user_id = %s",
            (user_id,),
        )
        row = cur.fetchone()
        if not row:
            raise HTTPException(404, "USER_NOT_FOUND")

        current_level_id, current_score = row
        new_level_id = req.user_level_id
        new_score = current_score  # 預設保留原本分數

        if new_level_id > current_level_id:
            # 升等：如果分數低於門檻，調到最低分
            min_score = LEVEL_MIN_SCORE[new_level_id]
            if current_score < min_score:
                new_score = min_score
        # 降等：保留原本分數

        cur.execute(
            "UPDATE app_user SET user_level_id = %s, total_score = %s WHERE user_id = %s",
            (new_level_id, new_score, user_id),
        )
        conn.commit()
        return {
            "message":       "level updated",
            "user_id":       user_id,
            "user_level_id": new_level_id,
            "total_score":   new_score,
            "score_changed": new_score != current_score,
        }
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(500, str(e))
    finally:
        cur.close()
        conn.close()


# ── GET /admin/levels　取得所有等級設定 ──────────────────────────
@router.get("/levels")
def get_levels(current_user: dict = Depends(get_current_user)):
    conn = get_db()
    cur  = conn.cursor()
    try:
        cur.execute("""
            SELECT user_level_id, level_code, level_name, min_score, risk_weight
            FROM user_level ORDER BY min_score
        """)
        rows = cur.fetchall()
        return [
            {
                "user_level_id": row[0],
                "level_code":    row[1],
                "level_name":    row[2],
                "min_score":     row[3],
                "risk_weight":   row[4],
            }
            for row in rows
        ]
    except Exception as e:
        raise HTTPException(500, str(e))
    finally:
        cur.close()
        conn.close()


# ── PATCH /admin/levels/{level_id}　更新等級門檻與風險權重 ────────
class AdminLevelConfig(BaseModel):
    min_score:   Optional[int]   = None
    risk_weight: Optional[float] = None


@router.patch("/levels/{level_id}")
def update_level_config(
    level_id: int,
    req: AdminLevelConfig,
    current_user: dict = Depends(get_current_user),
):
    if level_id not in (1, 2, 3):
        raise HTTPException(400, "INVALID_LEVEL_ID")

    conn = get_db()
    cur  = conn.cursor()
    try:
        updates = []
        params  = []
        if req.min_score is not None:
            updates.append("min_score = %s")
            params.append(req.min_score)
        if req.risk_weight is not None:
            updates.append("risk_weight = %s")
            params.append(req.risk_weight)
        if not updates:
            raise HTTPException(400, "NO_FIELDS_TO_UPDATE")

        params.append(level_id)
        cur.execute(
            f"UPDATE user_level SET {', '.join(updates)}, updated_at = NOW() WHERE user_level_id = %s RETURNING user_level_id, level_code, min_score, risk_weight",
            params,
        )
        row = cur.fetchone()
        if not row:
            raise HTTPException(404, "LEVEL_NOT_FOUND")
        conn.commit()
        return {
            "message":       "level config updated",
            "user_level_id": row[0],
            "level_code":    row[1],
            "min_score":     row[2],
            "risk_weight":   row[3],
        }
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(500, str(e))
    finally:
        cur.close()
        conn.close()


# ── PATCH /admin/users/{user_id}/score　直接修改分數 ─────────────
class AdminScoreUpdate(BaseModel):
    total_score: int


@router.patch("/users/{user_id}/score")
def admin_update_score(
    user_id: int,
    req: AdminScoreUpdate,
    current_user: dict = Depends(get_current_user),
):
    if req.total_score < 0:
        raise HTTPException(400, "INVALID_SCORE")

    conn = get_db()
    cur  = conn.cursor()
    try:
        cur.execute("SELECT user_id FROM app_user WHERE user_id = %s", (user_id,))
        if not cur.fetchone():
            raise HTTPException(404, "USER_NOT_FOUND")

        # 更新分數並自動調整等級
        cur.execute("""
            UPDATE app_user
            SET total_score  = %s,
                user_level_id = (
                    SELECT user_level_id FROM user_level
                    WHERE min_score <= %s
                    ORDER BY min_score DESC LIMIT 1
                )
            WHERE user_id = %s
            RETURNING total_score, user_level_id
        """, (req.total_score, req.total_score, user_id))
        new_score, new_level_id = cur.fetchone()
        conn.commit()
        return {
            "message":       "score updated",
            "user_id":       user_id,
            "total_score":   new_score,
            "user_level_id": new_level_id,
        }
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(500, str(e))
    finally:
        cur.close()
        conn.close()


# ── DELETE /admin/users/{user_id}　刪除使用者 ────────────────────
@router.delete("/users/{user_id}")
def admin_delete_user(
    user_id: int,
    current_user: dict = Depends(get_current_user),
):
    conn = get_db()
    cur  = conn.cursor()
    try:
        cur.execute("SELECT role FROM app_user WHERE user_id = %s", (user_id,))
        row = cur.fetchone()
        if not row:
            raise HTTPException(404, "USER_NOT_FOUND")
        if row[0] == "admin":
            raise HTTPException(400, "CANNOT_DELETE_ADMIN")

        # 刪除練習紀錄 → 路線請求 → 使用者
        cur.execute("DELETE FROM user_practice_history WHERE user_id = %s", (user_id,))
        cur.execute("""
            DELETE FROM route_segment
            WHERE route_id IN (
                SELECT r.route_id FROM route r
                JOIN route_request rq ON r.request_id = rq.request_id
                WHERE rq.user_id = %s
            )
        """, (user_id,))
        cur.execute("""
            DELETE FROM route
            WHERE request_id IN (
                SELECT request_id FROM route_request WHERE user_id = %s
            )
        """, (user_id,))
        cur.execute("DELETE FROM route_request WHERE user_id = %s", (user_id,))
        cur.execute("DELETE FROM app_user WHERE user_id = %s", (user_id,))
        conn.commit()
        return {"message": "user deleted", "user_id": user_id}
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(500, str(e))
    finally:
        cur.close()
        conn.close()


# ── DELETE /admin/routes/{route_id}　刪除路線 ────────────────────
@router.delete("/routes/{route_id}")
def admin_delete_route(
    route_id: int,
    current_user: dict = Depends(get_current_user),
):
    conn = get_db()
    cur  = conn.cursor()
    try:
        cur.execute("SELECT route_id FROM route WHERE route_id = %s", (route_id,))
        if not cur.fetchone():
            raise HTTPException(404, "ROUTE_NOT_FOUND")

        cur.execute("DELETE FROM user_practice_history WHERE route_id = %s", (route_id,))
        cur.execute("DELETE FROM route_segment WHERE route_id = %s", (route_id,))
        cur.execute("DELETE FROM route WHERE route_id = %s", (route_id,))
        conn.commit()
        return {"message": "route deleted", "route_id": route_id}
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(500, str(e))
    finally:
        cur.close()
        conn.close()


# ── DELETE /admin/practice/{practice_id}　刪除練習紀錄 ───────────
@router.delete("/practice/{practice_id}")
def admin_delete_practice(
    practice_id: int,
    current_user: dict = Depends(get_current_user),
):
    conn = get_db()
    cur  = conn.cursor()
    try:
        cur.execute(
            "SELECT user_id, score_earned FROM user_practice_history WHERE practice_id = %s",
            (practice_id,)
        )
        row = cur.fetchone()
        if not row:
            raise HTTPException(404, "PRACTICE_NOT_FOUND")

        user_id, score_earned = row
        cur.execute("DELETE FROM user_practice_history WHERE practice_id = %s", (practice_id,))
        # 扣回分數
        cur.execute(
            "UPDATE app_user SET total_score = GREATEST(0, total_score - %s) WHERE user_id = %s",
            (score_earned, user_id)
        )
        conn.commit()
        return {"message": "practice deleted", "practice_id": practice_id, "score_deducted": score_earned}
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(500, str(e))
    finally:
        cur.close()
        conn.close()


# ── GET /admin/risk　取得道路風險資料 ────────────────────────────
@router.get("/risk")
def get_risk(
    search: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
):
    conn = get_db()
    cur  = conn.cursor()
    try:
        query = """
            SELECT edge_id, name, fclass, bridge, tunnel, risk_score
            FROM road_edges_guishan
            WHERE edge_id < 9000000
        """
        params = []
        if search:
            query += " AND name ILIKE %s"
            params.append(f"%{search}%")
        query += " ORDER BY risk_score DESC, edge_id LIMIT 500"

        cur.execute(query, params)
        rows = cur.fetchall()
        return [
            {
                "edge_id":    row[0],
                "road_name":  row[1] or "",
                "highway":    row[2] or "",
                "bridge":     row[3] == "T",
                "tunnel":     row[4] == "T",
                "risk_score": float(row[5]) if row[5] else 0.0,
            }
            for row in rows
        ]
    except Exception as e:
        raise HTTPException(500, str(e))
    finally:
        cur.close()
        conn.close()


# ── PATCH /admin/risk/{edge_id}　更新道路風險分數 ─────────────────
class AdminRiskUpdate(BaseModel):
    risk_score: float


@router.patch("/risk/{edge_id}")
def update_risk(
    edge_id: int,
    req: AdminRiskUpdate,
    current_user: dict = Depends(get_current_user),
):
    if req.risk_score < 0:
        raise HTTPException(400, "INVALID_RISK_SCORE")

    conn = get_db()
    cur  = conn.cursor()
    try:
        cur.execute(
            "UPDATE road_edges_guishan SET risk_score = %s WHERE edge_id = %s RETURNING edge_id",
            (req.risk_score, edge_id)
        )
        if not cur.fetchone():
            raise HTTPException(404, "EDGE_NOT_FOUND")
        conn.commit()
        return {"message": "risk updated", "edge_id": edge_id, "risk_score": req.risk_score}
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(500, str(e))
    finally:
        cur.close()
        conn.close()