from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, EmailStr, Field
from typing import Optional
from datetime import date
import bcrypt
import json

from database import get_db
from utils.auth import create_access_token

router = APIRouter(prefix="/auth", tags=["auth"])


# ── Request schemas ──────────────────────────────────────────────

class RegisterRequest(BaseModel):
    username:     str            = Field(min_length=1,  max_length=26)
    email:        EmailStr
    password:     str            = Field(min_length=6,  max_length=26)
    birth_date:   str            = Field(pattern=r'^\d{4}-\d{2}-\d{2}$')
    license_date: str            = Field(pattern=r'^\d{4}-\d{2}-\d{2}$')
    address:      Optional[str]  = None


class LoginRequest(BaseModel):
    email:    EmailStr
    password: str = Field(min_length=1, max_length=100)


# ── 工具函式 ──────────────────────────────────────────────────────

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()

def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode(), hashed.encode())

def validate_license_age(birth_date_str: str, license_date_str: str):
    birth = date.fromisoformat(birth_date_str)
    lic   = date.fromisoformat(license_date_str)
    if (lic - birth).days / 365.25 < 18:
        raise HTTPException(status_code=400, detail="LICENSE_AGE_INVALID")


# ── 端點 ──────────────────────────────────────────────────────────

@router.post("/register")
def register(req: RegisterRequest):
    validate_license_age(req.birth_date, req.license_date)
    conn = get_db()
    cur  = conn.cursor()
    try:
        cur.execute("SELECT user_id FROM app_user WHERE email = %s", (str(req.email),))
        if cur.fetchone():
            raise HTTPException(status_code=400, detail="EMAIL_ALREADY_EXISTS")

        cur.execute("""
            INSERT INTO app_user
              (username, email, password_hash, birth_date, license_date, address,
               user_level_id, total_score, role)
            VALUES (%s, %s, %s, %s, %s, %s, 1, 0, 'user')
            RETURNING user_id, username, user_level_id
        """, (
            req.username,
            str(req.email),
            hash_password(req.password),
            req.birth_date,
            req.license_date,
            req.address,
        ))

        user_id, username, user_level_id = cur.fetchone()
        conn.commit()

        token = create_access_token(user_id, username)
        return {
            "message":       "register success",
            "token":         token,
            "user_id":       user_id,
            "username":      username,
            "user_level_id": user_level_id
        }

    except HTTPException:
        raise
    except Exception:
        conn.rollback()
        raise HTTPException(status_code=500, detail="INTERNAL_SERVER_ERROR")
    finally:
        cur.close()
        conn.close()


@router.post("/login")
def login(req: LoginRequest):
    conn = get_db()
    cur  = conn.cursor()
    try:
        cur.execute("""
            SELECT user_id, username, password_hash, user_level_id, role
            FROM app_user WHERE email = %s
        """, (str(req.email),))

        row = cur.fetchone()

        if not row or not verify_password(req.password, row[2]):
            raise HTTPException(status_code=401, detail="INVALID_CREDENTIALS")

        user_id, username, _, user_level_id, role = row
        token = create_access_token(user_id, username)

        return {
            "message":       "login success",
            "token":         token,
            "user_id":       user_id,
            "username":      username,
            "user_level_id": user_level_id,
            "role":          role,
        }

    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=500, detail="INTERNAL_SERVER_ERROR")
    finally:
        cur.close()
        conn.close()
