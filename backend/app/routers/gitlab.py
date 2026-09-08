import secrets

from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.deps import get_current_user
from app.jobs.gitlab_webhook import process_webhook_event
from app.models.gitlab_connection import GitLabConnection
from app.models.user import User
from app.models.webhook_event import WebhookEvent
from app.queue import webhook_queue
from app.schemas.gitlab import GitLabConnect, GitLabConnectionOut
from app.services.crypto import encrypt
from app.services.gitlab_client import GitLabClientError
from app.services.gitlab_client import get_current_user as fetch_gitlab_user
from app.services.permissions import get_org_role

router = APIRouter(tags=["gitlab"])


def _webhook_url(org_id: int, request: Request) -> str:
    return f"{str(request.base_url).rstrip('/')}/webhooks/gitlab/{org_id}"


async def _get_connection(org_id: int, db: AsyncSession) -> GitLabConnection | None:
    result = await db.execute(select(GitLabConnection).where(GitLabConnection.org_id == org_id))
    return result.scalar_one_or_none()


async def _require_org_admin(org_id: int, user: User, db: AsyncSession) -> None:
    role = await get_org_role(org_id, user.id, db)
    if role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")


@router.get("/organizations/{org_id}/gitlab", response_model=GitLabConnectionOut)
async def get_gitlab_connection(
    org_id: int,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> GitLabConnectionOut:
    await _require_org_admin(org_id, current_user, db)
    connection = await _get_connection(org_id, db)
    if connection is None:
        return GitLabConnectionOut(connected=False)

    return GitLabConnectionOut(
        connected=True,
        base_url=connection.base_url,
        gitlab_username=connection.gitlab_username,
        webhook_url=_webhook_url(org_id, request),
        webhook_secret=connection.webhook_secret,
        connected_at=connection.created_at,
    )


@router.post(
    "/organizations/{org_id}/gitlab", response_model=GitLabConnectionOut, status_code=status.HTTP_201_CREATED
)
async def connect_gitlab(
    org_id: int,
    payload: GitLabConnect,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> GitLabConnectionOut:
    await _require_org_admin(org_id, current_user, db)

    base_url = payload.base_url.rstrip("/")
    try:
        gitlab_user = await fetch_gitlab_user(base_url, payload.token)
    except GitLabClientError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    connection = await _get_connection(org_id, db)
    if connection is None:
        connection = GitLabConnection(
            org_id=org_id,
            base_url=base_url,
            webhook_secret=secrets.token_urlsafe(32),
        )
        db.add(connection)

    connection.base_url = base_url
    connection.auth_type = "pat"
    connection.encrypted_token = encrypt(payload.token)
    connection.gitlab_username = gitlab_user.get("username")
    connection.connected_by_id = current_user.id

    await db.commit()
    await db.refresh(connection)

    return GitLabConnectionOut(
        connected=True,
        base_url=connection.base_url,
        gitlab_username=connection.gitlab_username,
        webhook_url=_webhook_url(org_id, request),
        webhook_secret=connection.webhook_secret,
        connected_at=connection.created_at,
    )


@router.delete("/organizations/{org_id}/gitlab", status_code=status.HTTP_204_NO_CONTENT)
async def disconnect_gitlab(
    org_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    await _require_org_admin(org_id, current_user, db)
    connection = await _get_connection(org_id, db)
    if connection is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not connected")
    await db.delete(connection)
    await db.commit()


@router.post("/webhooks/gitlab/{org_id}", status_code=status.HTTP_202_ACCEPTED)
async def receive_gitlab_webhook(
    org_id: int,
    request: Request,
    db: AsyncSession = Depends(get_db),
    x_gitlab_token: str | None = Header(default=None, alias="X-Gitlab-Token"),
) -> dict:
    connection = await _get_connection(org_id, db)
    if connection is None or not x_gitlab_token or not secrets.compare_digest(
        x_gitlab_token, connection.webhook_secret
    ):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid webhook token")

    body = await request.json()
    event_type = body.get("object_kind", "unknown")

    event = WebhookEvent(org_id=org_id, event_type=event_type, payload=body)
    db.add(event)
    await db.commit()
    await db.refresh(event)

    webhook_queue.enqueue(process_webhook_event, event.id)

    return {"status": "queued"}
