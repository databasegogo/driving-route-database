from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional, Any
import json
import bcrypt

from database import get_db
from utils.auth import get_current_user

router = APIRouter(prefix="/user", tags=["user"])


class PreferenceRequest(BaseModel):
    avoid_bridge:   bool = False
    avoid_tunnel:   bool = False
    max_distance_m: Optional[int] = None


@router.get("/me")
def get_me(current_user: dict = Depends(get_current_user)):
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
                ul.min_score        AS current_level_min,
                next_ul.min_score   AS next_level_min,
                next_ul.level_code  AS next_level_code,
                u.address
            FROM app_user u
            JOIN user_level ul ON u.user_level_id = ul.user_level_id
            LEFT JOIN user_level next_ul
                ON next_ul.min_score = (
                    SELECT MIN(min_score) FROM user_level
                    WHERE min_score > ul.min_score
                )
            WHERE u.user_id = %s
        """, (current_user["user_id"],))

        row = cur.fetchone()
        if not row:
            raise HTTPException(404, "USER_NOT_FOUND")

        next_level_min = row[9]
        progress = (
            round(row[5] / next_level_min * 100, 1)
            if next_level_min else 100.0
        )

        # address 存為 JSON 字串，回傳時解析成 dict
        addr_raw = row[11]
        try:
            address = json.loads(addr_raw) if addr_raw else {}
        except Exception:
            address = {}

        return {
            "user_id":          row[0],
            "username":         row[1],
            "email":            row[2],
            "birth_date":       row[3].isoformat() if row[3] else None,
            "license_date":     row[4].isoformat() if row[4] else None,
            "total_score":      row[5],
            "role":             row[6],
            "level_code":       row[7],
            "next_level_code":  row[10],
            "next_level_min":   next_level_min,
            "level_progress_pct": progress,
            "address":          address,
        }

    except HTTPException:
        raise
    except Exception:
        raise HTTPException(500, "INTERNAL_SERVER_ERROR")
    finally:
        cur.close()
        conn.close()


class ProfileUpdateRequest(BaseModel):
    birth_date:    Optional[str] = None
    license_date:  Optional[str] = None
    old_password:  Optional[str] = None
    new_password:  Optional[str] = None
    address:       Optional[Any] = None   # dict 或 None


@router.put("/profile")
def update_profile(req: ProfileUpdateRequest, current_user: dict = Depends(get_current_user)):
    conn = get_db()
    cur  = conn.cursor()
    try:
        user_id = current_user["user_id"]

        # 密碼變更（如有提供 old_password）
        if req.old_password is not None:
            cur.execute("SELECT password_hash FROM app_user WHERE user_id = %s", (user_id,))
            row = cur.fetchone()
            if not row or not bcrypt.checkpw(req.old_password.encode(), row[0].encode()):
                raise HTTPException(400, "WRONG_OLD_PASSWORD")
            if not req.new_password or len(req.new_password) < 4:
                raise HTTPException(400, "NEW_PASSWORD_TOO_SHORT")
            new_hash = bcrypt.hashpw(req.new_password.encode(), bcrypt.gensalt()).decode()
            cur.execute("UPDATE app_user SET password_hash = %s WHERE user_id = %s",
                        (new_hash, user_id))

        # 日期欄位（任一有值就更新）
        if req.birth_date is not None:
            cur.execute("UPDATE app_user SET birth_date = %s WHERE user_id = %s",
                        (req.birth_date, user_id))
        if req.license_date is not None:
            cur.execute("UPDATE app_user SET license_date = %s WHERE user_id = %s",
                        (req.license_date, user_id))

        # 地址（dict → JSON 字串存入 DB）
        if req.address is not None:
            addr_str = json.dumps(req.address, ensure_ascii=False)
            cur.execute("UPDATE app_user SET address = %s WHERE user_id = %s",
                        (addr_str, user_id))

        conn.commit()
        return {"message": "profile updated"}

    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(500, str(e))
    finally:
        cur.close()
        conn.close()


@router.put("/preference")
def update_preference(req: PreferenceRequest, current_user: dict = Depends(get_current_user)):
    conn = get_db()
    cur  = conn.cursor()
    try:
        user_id = current_user["user_id"]

        # 有紀錄就更新，沒有就新增
        cur.execute("""
            INSERT INTO user_route_preference
              (user_id, avoid_bridge, avoid_tunnel, max_distance_m)
            VALUES (%s, %s, %s, %s)
            ON CONFLICT (user_id) DO UPDATE SET
              avoid_bridge   = EXCLUDED.avoid_bridge,
              avoid_tunnel   = EXCLUDED.avoid_tunnel,
              max_distance_m = EXCLUDED.max_distance_m
            RETURNING avoid_bridge, avoid_tunnel, max_distance_m
        """, (user_id, req.avoid_bridge, req.avoid_tunnel, req.max_distance_m))

        row = cur.fetchone()
        conn.commit()

        return {
            "message":        "preference updated",
            "avoid_bridge":   row[0],
            "avoid_tunnel":   row[1],
            "max_distance_m": row[2]
        }

    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(500, str(e))
    finally:
        cur.close()
        conn.close()