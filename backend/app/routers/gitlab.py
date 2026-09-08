import secrets
from datetime import datetime, timedelta, timezone
from urllib.parse import quote

from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from fastapi.responses import RedirectResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.deps import get_current_user
from app.jobs.gitlab_webhook import process_webhook_event
from app.models.gitlab_connection import GitLabConnection
from app.models.user import User
from app.models.webhook_event import WebhookEvent
from app.queue import webhook_queue
from app.schemas.gitlab import GitLabConnectionOut, GitLabOAuthStart, GitLabOAuthStartOut
from app.services.crypto import decrypt, encrypt
from app.services.gitlab_client import GitLabClientError
from app.services.gitlab_client import get_current_user as fetch_gitlab_user
from app.services.gitlab_oauth import (
    GitLabOAuthError,
    build_authorize_url,
    exchange_code,
    make_state,
    verify_state,
)
from app.services.permissions import get_org_role

router = APIRouter(tags=["gitlab"])


def _public_base_url(request: Request) -> str:
    if settings.public_api_base_url:
        return settings.public_api_base_url.rstrip("/")
    return str(request.base_url).rstrip("/")


def _webhook_url(org_id: int, request: Request) -> str:
    return f"{_public_base_url(request)}/webhooks/gitlab/{org_id}"


def _oauth_redirect_uri(request: Request) -> str:
    return f"{_public_base_url(request)}/gitlab/oauth/callback"


def _frontend_url(org_id: int, **params: str) -> str:
    origins = settings.cors_origins_list
    base = origins[0] if origins else ""
    query = ("?" + "&".join(f"{k}={quote(v)}" for k, v in params.items())) if params else ""
    return f"{base}/organizations/{org_id}{query}"


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
        connected=connection.encrypted_token is not None,
        base_url=connection.base_url,
        client_id=connection.client_id,
        gitlab_username=connection.gitlab_username,
        webhook_url=_webhook_url(org_id, request),
        webhook_secret=connection.webhook_secret,
        connected_at=connection.created_at,
    )


@router.post("/organizations/{org_id}/gitlab/oauth/start", response_model=GitLabOAuthStartOut)
async def start_gitlab_oauth(
    org_id: int,
    payload: GitLabOAuthStart,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> GitLabOAuthStartOut:
    await _require_org_admin(org_id, current_user, db)

    base_url = payload.base_url.rstrip("/")
    connection = await _get_connection(org_id, db)
    if connection is None:
        connection = GitLabConnection(org_id=org_id, webhook_secret=secrets.token_urlsafe(32))
        db.add(connection)

    connection.base_url = base_url
    connection.auth_type = "oauth"
    connection.client_id = payload.client_id
    connection.encrypted_client_secret = encrypt(payload.client_secret)
    connection.connected_by_id = current_user.id

    await db.commit()

    redirect_uri = _oauth_redirect_uri(request)
    state = make_state(org_id, redirect_uri)
    authorize_url = build_authorize_url(base_url, payload.client_id, redirect_uri, state)

    return GitLabOAuthStartOut(authorize_url=authorize_url)


@router.get("/gitlab/oauth/callback")
async def gitlab_oauth_callback(
    request: Request,
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
    error_description: str | None = None,
    db: AsyncSession = Depends(get_db),
) -> RedirectResponse:
    if error:
        # No org_id available without a valid state, so there's nowhere safe to redirect to.
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=error_description or error
        )
    if not code or not state:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Missing code or state")

    try:
        claims = verify_state(state)
    except GitLabOAuthError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    org_id = claims["org_id"]
    redirect_uri = claims["redirect_uri"]

    connection = await _get_connection(org_id, db)
    if connection is None or not connection.client_id or not connection.encrypted_client_secret:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No pending GitLab connection")

    try:
        tokens = await exchange_code(
            connection.base_url, connection.client_id, decrypt(connection.encrypted_client_secret), code, redirect_uri
        )
        gitlab_user = await fetch_gitlab_user(connection.base_url, tokens["access_token"])
    except (GitLabOAuthError, GitLabClientError) as exc:
        return RedirectResponse(_frontend_url(org_id, gitlab_error=str(exc)))

    connection.encrypted_token = encrypt(tokens["access_token"])
    connection.encrypted_refresh_token = encrypt(tokens["refresh_token"]) if tokens.get("refresh_token") else None
    connection.token_expires_at = datetime.now(timezone.utc) + timedelta(seconds=tokens.get("expires_in", 7200))
    connection.gitlab_username = gitlab_user.get("username")

    await db.commit()

    return RedirectResponse(_frontend_url(org_id, gitlab="connected"))


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
