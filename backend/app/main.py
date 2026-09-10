from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.routers import (
    auth,
    auth_gitlab,
    boards,
    card_links,
    cards,
    columns,
    gitlab,
    gitlab_admin,
    me_gitlab,
    milestones,
    notifications,
    organizations,
    pm,
    projects,
)

app = FastAPI(title="Viduthalai API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(boards.router)
app.include_router(columns.router)
app.include_router(cards.router)
app.include_router(organizations.router)
app.include_router(projects.router)
app.include_router(milestones.router)
app.include_router(pm.router)
app.include_router(gitlab.router)
app.include_router(card_links.router)
app.include_router(auth_gitlab.router)
app.include_router(me_gitlab.router)
app.include_router(gitlab_admin.router)
app.include_router(notifications.router)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
