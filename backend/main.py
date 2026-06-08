from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers import auth, user, route, practice, district, admin

app = FastAPI(title="駕駛練習路線系統")

# CORS：讓前端 localhost 能打 API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 掛上所有 router
app.include_router(auth.router)
app.include_router(user.router)
app.include_router(route.router)
app.include_router(practice.router)
app.include_router(district.router)
app.include_router(admin.router)


@app.get("/")
def root():
    return {"message": "API is running"}=======
app.include_router(district.router)
>>>>>>> origin/main


@app.get("/")
def root():
    return {"message": "API is running"}
