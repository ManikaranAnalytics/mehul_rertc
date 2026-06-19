import os
from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from routers import schedule, generation, psp, export, persistence, admin, auth
from db.database import init_db, check_db_connection


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        init_db()
        if check_db_connection():
            print("PostgreSQL connected and tables ready.")
        else:
            print("WARNING: PostgreSQL not reachable — persistence API will fail until DB is up.")
    except Exception as exc:
        print(f"WARNING: Database init failed: {exc}")
    yield


app = FastAPI(
    title="RE-RTC Dispatch Optimizer API",
    description="Backend optimization engine for Aditya Birla Renewables' 100 MW RTC PPA with Hindalco Industries.",
    version="1.0.0",
    lifespan=lifespan,
)

# CORS — dev: allow all; production: nginx proxies /api on same origin
_ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "*").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=_ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API routers
app.include_router(schedule.router, prefix="/api", tags=["Scheduling"])
app.include_router(generation.router, prefix="/api", tags=["Raw Generation"])
app.include_router(psp.router, prefix="/api/psp", tags=["PSP Storage"])
app.include_router(export.router, prefix="/api", tags=["Export"])
app.include_router(persistence.router, prefix="/api")
app.include_router(auth.router, prefix="/api")
app.include_router(admin.router, prefix="/api")

# Optional: serve built React app from the backend (single-container legacy mode).
# Segregated Docker deployment uses the frontend/nginx container instead.
_SERVE_FRONTEND = os.getenv("SERVE_FRONTEND", "false").lower() in ("1", "true", "yes")
_FRONTEND_DIST_DEFAULT = os.path.normpath(
    os.path.join(os.path.dirname(__file__), "..", "frontend", "dist")
)
FRONTEND_DIST = os.path.abspath(os.getenv("FRONTEND_DIST", _FRONTEND_DIST_DEFAULT))

if _SERVE_FRONTEND and os.path.isdir(FRONTEND_DIST):
    from pathlib import Path

    _dist = Path(FRONTEND_DIST)
    _assets = _dist / "assets"
    if _assets.is_dir():
        app.mount("/assets", StaticFiles(directory=str(_assets)), name="static-assets")

    @app.get("/{spa_path:path}")
    async def serve_spa(spa_path: str):
        if spa_path and (_dist / spa_path).is_file():
            return FileResponse(_dist / spa_path)
        return FileResponse(_dist / "index.html")
else:
    @app.get("/")
    def read_root():
        return {
            "message": "RE-RTC Dispatch Optimizer API is running.",
            "docs": "/docs",
            "status": "Frontend not built. Run: cd frontend && npm install && npm run build",
        }

if __name__ == "__main__":
    port = int(os.getenv("PORT", 8012))
    # Single worker + reload in dev so schema/code changes apply without a manual restart
    workers = int(os.getenv("WEB_CONCURRENCY", 1))
    use_reload = os.getenv("DEV_RELOAD", "true").lower() in ("1", "true", "yes")
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=port,
        workers=workers,
        reload=use_reload and workers == 1,
    )
