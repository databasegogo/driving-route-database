from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
import hashlib

from database import get_db
from utils.auth import create_access_token

router = APIRouter(prefix="/auth", tags=["auth"])


# ── Request schemas ──────────────────────────────────────────────

class RegisterRequest(BaseModel):
    username: str
    email: str
    password: str
    birth_date: str    # 格式：YYYY-MM-DD
    license_date: str  # 格式：YYYY-MM-DD


class LoginRequest(BaseModel):
    email: str
    password: str


# ── 工具函式 ──────────────────────────────────────────────────────

def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode()).hexdigest()


# ── 端點 ──────────────────────────────────────────────────────────

@router.post("/register")
def register(req: RegisterRequest):
    conn = get_db()
    cur = conn.cursor()
    try:
        # 檢查 email 是否已被註冊
        cur.execute("SELECT user_id FROM app_user WHERE email = %s", (req.email,))
        if cur.fetchone():
            raise HTTPException(status_code=400, detail="EMAIL_ALREADY_EXISTS")

        # 新增使用者
        cur.execute("""
            INSERT INTO app_user
              (username, email, password_hash, birth_date, license_date,
               user_level_id, total_score, role)
            VALUES (%s, %s, %s, %s, %s, 1, 0, 'user')
            RETURNING user_id, username, user_level_id
        """, (
            req.username,
            req.email,
            hash_password(req.password),
            req.birth_date,
            req.license_date,
        ))

        user_id, username, user_level_id = cur.fetchone()
        conn.commit()

        token = create_access_token(user_id, username)

        return {
            "message": "register success",
            "token": token,
            "user_id": user_id,
            "username": username,
            "user_level_id": user_level_id
        }

    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cur.close()
        conn.close()


@router.post("/login")
def login(req: LoginRequest):
    conn = get_db()
    cur = conn.cursor()
    try:
        cur.execute("""
            SELECT user_id, username, password_hash, user_level_id
            FROM app_user
            WHERE email = %s
        """, (req.email,))

        row = cur.fetchone()

        # email 不存在 或 密碼錯誤 → 同一個錯誤訊息（避免洩漏資訊）
        if not row or row[2] != hash_password(req.password):
            raise HTTPException(status_code=401, detail="INVALID_CREDENTIALS")

        user_id, username, _, user_level_id = row
        token = create_access_token(user_id, username)

        return {
            "message": "login success",
            "token": token,
            "user_id": user_id,
            "username": username,
            "user_level_id": user_level_id
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        cur.close()
        conn.close()