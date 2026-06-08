from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

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