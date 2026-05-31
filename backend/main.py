from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers import auth, user, route, practice

app = FastAPI(title="駕駛練習路線系統")

# CORS：讓前端 localhost 能打 API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],   # 開發階段先全開，上線前再限縮
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 掛上所有 router
app.include_router(auth.router)
app.include_router(user.router)
app.include_router(route.router)
app.include_router(practice.router)


@app.get("/")
def root():
    return {"message": "API is running"}
