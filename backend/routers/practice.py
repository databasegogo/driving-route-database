from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from datetime import datetime, timezone, timedelta

from database import get_db
from utils.auth import get_current_user
from constants import SCORE_WEIGHT, LEVEL_ORDER, LEVEL_CODE

router = APIRouter(prefix="/practice", tags=["practice"])


def taiwan_today_start_utc() -> datetime:
    """台灣今日 00:00 轉成 UTC naive datetime（與 DB TIMESTAMP 欄位型別一致）。
    使用 Python 計算而非 SQL CURRENT_DATE，
    確保每日限制以台灣午夜重置，不受 PostgreSQL 伺服器時區影響。
    """
    taipei = timezone(timedelta(hours=8))
    now_tw = datetime.now(taipei)
    midnight_tw = now_tw.replace(hour=0, minute=0, second=0, microsecond=0)
    return midnight_tw.astimezone(timezone.utc).replace(tzinfo=None)


class PracticeRequest(BaseModel):
    route_id:            int
    selected_difficulty: str
    actual_duration_sec: int | None   = None  # 實際練習秒數（None = 不計時）
    gps_verified:        bool         = False # GPS 偵測到達終點為 True（全程完成）
    terminated_early:    bool         = False # 使用者主動終止練習（提前結束）
    was_off_route:       bool         = False # 練習中曾偏離路線超過 100m
    covered_pct:         float | None = None  # GPS 位置比例（0~1），提前終止時由前端傳入

    @property
    def validated_duration(self) -> int | None:
        if self.actual_duration_sec is None:
            return None
        v = min(max(0, self.actual_duration_sec), 86400)  # 最多 24 小時，防超大值
        if v < 10:   # 10 秒以下視為異常
            return None
        return v


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

        # 1b. actual_duration_sec 限制在合理範圍（防超大值讓 practice_time 跑到過去）
        safe_dur = None
        if req.actual_duration_sec is not None:
            safe_dur = min(max(0, req.actual_duration_sec), 86400)

        # 每日限制基準：台灣今日 00:00 對應的 UTC 時間
        # 用 Python 計算而非 SQL CURRENT_DATE，確保以台灣午夜重置（不受伺服器 UTC 時區影響）
        today_start = taiwan_today_start_utc()

        # 1c. 防刷分邏輯
        # - GPS 驗證到達終點（gps_verified=true）→ 不限次數，全額計分，最短 60 秒
        # - 提前終止（terminated_early=true）    → 每日同路線最多 5 次，最短 30 秒
        # - 兩者皆否（手動完成）                 → 同路線當天只能計分一次
        MIN_GPS_SEC         = 60   # GPS 到達：最短練習時間
        MIN_TERMINATE_SEC   = 30   # 提前終止：最短練習時間
        MAX_TERMINATE_DAILY = 5    # 提前終止：同路線每日上限

        if req.gps_verified and (safe_dur or 0) < MIN_GPS_SEC:
            raise HTTPException(400, "PRACTICE_TOO_SHORT")

        if req.terminated_early:
            if (safe_dur or 0) < MIN_TERMINATE_SEC:
                raise HTTPException(400, "PRACTICE_TOO_SHORT")
            cur.execute("""
                SELECT COUNT(*) FROM user_practice_history
                WHERE user_id = %s AND route_id = %s
                  AND terminated_early = true
                  AND practice_time >= %s
            """, (user_id, req.route_id, today_start))
            if cur.fetchone()[0] >= MAX_TERMINATE_DAILY:
                raise HTTPException(400, "TERMINATE_DAILY_LIMIT")

        if not req.gps_verified and not req.terminated_early:
            cur.execute("""
                SELECT 1 FROM user_practice_history
                WHERE user_id = %s
                  AND route_id = %s
                  AND status = 'completed'
                  AND gps_verified = false
                  AND terminated_early = false
                  AND practice_time >= %s
            """, (user_id, req.route_id, today_start))
            if cur.fetchone():
                raise HTTPException(400, "MANUAL_COMPLETE_DAILY_LIMIT")

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
        duration         = req.validated_duration
        overtime_penalty = False   # 預設；只有全程完成且超過 2 倍時間才設 True

        if req.terminated_early:
            # 提前終止：依完成比例計算，再打 8 折
            # 優先用前端傳入的 GPS 位置比例（更準確：1 - 離終點/全程距離）
            # fallback：時間比例（GPS 不可用時）
            EARLY_DISCOUNT = 0.8
            if req.covered_pct is not None:
                covered_pct = max(0.0, min(float(req.covered_pct), 1.0))
                # 合理性驗證：GPS 比例不應超過時間比例的 3 倍
                # 防止繞過前端直接呼叫 API 傳入誇大的 covered_pct
                if safe_dur and estimated_duration_sec and estimated_duration_sec > 0:
                    time_pct = safe_dur / estimated_duration_sec
                    covered_pct = min(covered_pct, min(time_pct * 3.0, 1.0))
            elif duration and estimated_duration_sec and estimated_duration_sec > 0:
                covered_pct = min(duration / estimated_duration_sec, 1.0)
            else:
                covered_pct = 0.0   # 無計時與 GPS 資料就不計分
            base_score = int(total_distance_m * covered_pct / 1000
                             * EARLY_DISCOUNT) * SCORE_WEIGHT[req.selected_difficulty]
            # 完成 ≥ 25% 且因 int() 截斷得 0 → 至少保障 1 分
            if base_score == 0 and covered_pct >= 0.25 and total_distance_m > 0:
                base_score = 1
            time_bonus = 0          # 提前終止不給 time_bonus
        else:
            # 全程完成（GPS 驗證或正常完成）
            base_score = int(total_distance_m / 1000) * SCORE_WEIGHT[req.selected_difficulty]
            # 全程完成且路線有效 → 至少保障 1 分（防短路線被 int() 截斷為 0）
            if base_score == 0 and total_distance_m > 0:
                base_score = 1

            # 4b. 時間評分：
            #   在預估時間內完成         → +50%（time_bonus）
            #   超過預估但未到 2 倍      → 無加減分
            #   超過預估 2 倍（太久）    → 整體 × 0.9（overtime_penalty）
            time_bonus      = 0
            overtime_penalty = False
            if duration is not None and estimated_duration_sec and estimated_duration_sec > 0:
                if duration <= estimated_duration_sec:
                    time_bonus = (base_score + 1) // 2  # round-half-up，避免奇數 base_score 被 int() 向下截斷
                elif duration > estimated_duration_sec * 2:
                    overtime_penalty = True

        score_earned = base_score + time_bonus

        # 4c/4d. 懲罰乘數合併後一次截斷（避免分步 int() 造成雙重誤差）
        #        例：score=2, overtime+off_route → int(2×0.81)=1，而非 int(int(2×0.9)×0.9)=int(1×0.9)=0
        multiplier = 1.0
        if not req.terminated_early and overtime_penalty:
            multiplier *= 0.9
        if req.was_off_route:
            multiplier *= 0.9
        if multiplier < 1.0:
            score_earned = int(score_earned * multiplier)

        # 5. 新增練習紀錄
        cur.execute("""
            INSERT INTO user_practice_history
              (user_id, route_id, practice_time, end_time,
               status, selected_difficulty, score_earned, time_bonus,
               gps_verified, terminated_early)
            VALUES (%s, %s, NOW() - INTERVAL '1 second' * %s, NOW(),
                    'completed', %s, %s, %s, %s, %s)
            RETURNING practice_id
        """, (user_id, req.route_id,
              duration or 0,
              req.selected_difficulty, score_earned, time_bonus,
              req.gps_verified, req.terminated_early))
        practice_id = cur.fetchone()[0]

        # 6. 累加總分
        cur.execute("""
            UPDATE app_user
            SET total_score = total_score + %s
            WHERE user_id = %s
            RETURNING total_score
        """, (score_earned, user_id))
        new_total = cur.fetchone()[0]

        # 7. 自動升等
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
            "practice_id":       practice_id,
            "base_score":        base_score,
            "time_bonus":        time_bonus,
            "score_earned":      score_earned,
            "new_total_score":   new_total,
            "new_level_id":      new_level_id,
            "new_level":         LEVEL_CODE[new_level_id],
            "terminated_early":  req.terminated_early,
            "gps_verified":      req.gps_verified,
            "was_off_route":     req.was_off_route,
            "overtime_penalty":  (not req.terminated_early) and overtime_penalty,
        }

    except HTTPException:
        raise
    except Exception:
        conn.rollback()
        raise HTTPException(500, "INTERNAL_SERVER_ERROR")
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
                ph.is_favorite,
                r.total_distance_m,
                r.route_name,
                ph.terminated_early,
                ph.gps_verified,
                r.estimated_duration_sec,
                rr.start_name,
                rr.end_name
            FROM user_practice_history ph
            JOIN route r          ON ph.route_id   = r.route_id
            JOIN route_request rr ON r.request_id  = rr.request_id
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
                    "is_favorite":         row[8],
                    "total_distance_m":       round(row[9], 2) if row[9] else None,
                    "route_name":             row[10],
                    "terminated_early":       row[11],
                    "gps_verified":           row[12],
                    "estimated_duration_sec": row[13],
                    "start_name":             row[14],
                    "end_name":               row[15],
                }
                for row in rows
            ]
        }

    except HTTPException:
        raise
    except Exception:
        raise HTTPException(500, "INTERNAL_SERVER_ERROR")
    finally:
        cur.close()
        conn.close()


@router.put("/{practice_id}/favorite")
def toggle_favorite(practice_id: int, current_user: dict = Depends(get_current_user)):
    """切換練習紀錄的愛心收藏狀態"""
    conn = get_db()
    cur  = conn.cursor()
    try:
        user_id = current_user["user_id"]

        # 確認紀錄存在且屬於此使用者
        cur.execute(
            "SELECT is_favorite FROM user_practice_history WHERE practice_id = %s AND user_id = %s",
            (practice_id, user_id)
        )
        row = cur.fetchone()
        if not row:
            raise HTTPException(404, "PRACTICE_NOT_FOUND")

        new_value = not row[0]

        cur.execute("""
            UPDATE user_practice_history
            SET is_favorite = %s
            WHERE practice_id = %s AND user_id = %s
            RETURNING is_favorite
        """, (new_value, practice_id, user_id))
        result = cur.fetchone()[0]
        conn.commit()

        return {"practice_id": practice_id, "is_favorite": result}

    except HTTPException:
        raise
    except Exception:
        conn.rollback()
        raise HTTPException(500, "INTERNAL_SERVER_ERROR")
    finally:
        cur.close()
        conn.close()
