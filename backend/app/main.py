from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.router import api_router
from app.core.config import settings


@asynccontextmanager
async def lifespan(_: FastAPI):
    from app.core.database import SessionLocal
    from app.services.organization_defaults import seed_all_bankruptcy_organization_defaults

    db = SessionLocal()
    try:
        seed_all_bankruptcy_organization_defaults(db)
        db.commit()
    except Exception as exc:
        db.rollback()
        print(f"WARN: organization defaults sync on startup failed: {exc}")
    finally:
        db.close()
    yield


app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix=settings.API_PREFIX)


@app.get("/api/health")
def health_check() -> dict[str, str]:
    return {"status": "ok"}
