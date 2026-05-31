from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from database import get_db
from utils.auth import get_current_user

router = APIRouter(prefix="/practice", tags=["practice"])

SCORE_WEIGHT = {"BEGINNER": 1, "NORMAL": 2, "EXPERIENCED": 3}
LEVEL_ORDER  = {"BEGINNER": 1, "NORMAL": 2, "EXPERIENCED": 3}
LEVEL_CODE   = {1: "BEGINNER", 2: "NORMAL", 3: "EXPERIENCED"}


class PracticeRequest(BaseModel):
    route_id:             int
    selected_difficulty:  str            # "BEGINNER" / "NORMAL" / "EXPERIENCED"
    actual_duration_sec:  int | None = None  # 實際練習秒數（前端計時後傳入，None = 不計時）


@router.post("/complete")
def complete_practice(req: PracticeRequest, current_user: dict = Depends(get_current_user)):
    conn = get_db()
    cur  = conn.cursor()
    try:
        user_id = current_user["user_id"]

        # 1. 確認路線存在並取得距離與預估時間
        cur.execute(
            "SELECT total_distance_m, estimated_duration_sec FROM route WHERE route_id = %s",
            (req.route_id,)
        )
        row = cur.fetchone()
        if not row:
            raise HTTPException(404, "ROUTE_NOT_FOUND")
        total_distance_m, estimated_duration_sec = row

        # 2. 確認難度合法
        if req.selected_difficulty not in SCORE_WEIGHT:
            raise HTTPException(400, "INVALID_DIFFICULTY")

        # 3. 確認使用者等級有權選此難度
        cur.execute(
            "SELECT user_level_id FROM app_user WHERE user_id = %s",
            (user_id,)
        )
        user_row = cur.fetchone()
        if not user_row:
            raise HTTPException(404, "USER_NOT_FOUND")
        user_level_code = LEVEL_CODE[user_row[0]]
        if LEVEL_ORDER[req.selected_difficulty] > LEVEL_ORDER[user_level_code]:
            raise HTTPException(400, "DIFFICULTY_TOO_HIGH")

        # 4. 計算基本分數
        base_score = int(total_distance_m / 1000) * SCORE_WEIGHT[req.selected_difficulty]

        # 4b. 計算 time_bonus（在預估時間內完成 → 加 50%）
        time_bonus = 0
        if (req.actual_duration_sec is not None
                and estimated_duration_sec is not None
                and req.actual_duration_sec <= estimated_duration_sec):
            time_bonus = int(base_score * 0.5)

        score_earned = base_score + time_bonus

        # 5. 新增練習紀錄
        cur.execute("""
            INSERT INTO user_practice_history
              (user_id, route_id, practice_time, end_time,
               status, selected_difficulty, score_earned, time_bonus)
            VALUES (%s, %s, NOW() - INTERVAL '1 second' * %s, NOW(),
                    'completed', %s, %s, %s)
            RETURNING practice_id
        """, (user_id, req.route_id,
              req.actual_duration_sec or 0,
              req.selected_difficulty, score_earned, time_bonus))
        practice_id = cur.fetchone()[0]

        # 6. 累加總分
        cur.execute("""
            UPDATE app_user
            SET total_score = total_score + %s
            WHERE user_id = %s
            RETURNING total_score
        """, (score_earned, user_id))
        new_total = cur.fetchone()[0]

        # 7. 自動升等：找到分數已達門檻的最高等級
        cur.execute("""
            UPDATE app_user
            SET user_level_id = (
                SELECT user_level_id FROM user_level
                WHERE min_score <= %s
                ORDER BY min_score DESC
                LIMIT 1
            )
            WHERE user_id = %s
            RETURNING user_level_id
        """, (new_total, user_id))
        new_level_id = cur.fetchone()[0]

        conn.commit()

        return {
            "practice_id":     practice_id,
            "base_score":      base_score,
            "time_bonus":      time_bonus,
            "score_earned":    score_earned,
            "new_total_score": new_total,
            "new_level_id":    new_level_id,
            "new_level":       LEVEL_CODE[new_level_id]
        }

    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(500, str(e))
    finally:
        cur.close()
        conn.close()


@router.get("/history")
def get_history(current_user: dict = Depends(get_current_user)):
    conn = get_db()
    cur  = conn.cursor()
    try:
        user_id = current_user["user_id"]

        cur.execute("""
            SELECT
                ph.practice_id,
                ph.route_id,
                ph.practice_time,
                ph.end_time,
                ph.status,
                ph.selected_difficulty,
                ph.score_earned,
                ph.time_bonus,
                r.total_distance_m,
                r.route_name
            FROM user_practice_history ph
            JOIN route r ON ph.route_id = r.route_id
            WHERE ph.user_id = %s
            ORDER BY ph.practice_time DESC
        """, (user_id,))

        rows = cur.fetchall()

        return {
            "total": len(rows),
            "history": [
                {
                    "practice_id":         row[0],
                    "route_id":            row[1],
                    "practice_time":       row[2].isoformat() if row[2] else None,
                    "end_time":            row[3].isoformat() if row[3] else None,
                    "status":              row[4],
                    "selected_difficulty": row[5],
                    "score_earned":        row[6],
                    "time_bonus":          row[7],
                    "total_distance_m":    round(row[8], 2) if row[8] else None,
                    "route_name":          row[9],
                }
                for row in rows
            ]
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))
    finally:
        cur.close()
        conn.close()