from datetime import datetime, timedelta, timezone
import jwt
from jwt.exceptions import InvalidTokenError
from fastapi import HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

SECRET_KEY = "your-secret-key-change-this"   # 上線前請換成亂數字串
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24          # 24 小時

security = HTTPBearer()


def create_access_token(user_id: int, username: str) -> str:
    """產生 JWT"""
    payload = {
        "user_id": user_id,
        "username": username,
        "exp": datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def decode_token(token: str) -> dict:
    """解析 JWT，失敗時拋 401"""
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except InvalidTokenError:
        raise HTTPException(status_code=401, detail="UNAUTHORIZED")


def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> dict:
    """FastAPI dependency：從 Header 取出目前登入的使用者資訊"""
    return decode_token(credentials.credentials)
