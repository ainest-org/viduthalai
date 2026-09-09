import secrets
from datetime import datetime, timedelta, timezone
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import RedirectResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.database import get_db
from app.models.gitlab_connection import GitLabConnection
from app.models.user import User
from app.routers.gitlab import _get_connection, _public_base_url
from app.schemas.auth import Token, UserOut
from app.schemas.gitlab import (
    GitLabLoginExchange,
    GitLabLoginProvider,
    GitLabLoginStart,
    GitLabLoginStartOut,
)
from app.security import (
    create_access_token,
    create_login_exchange_code,
    decode_login_exchange_code,
    hash_password,
)
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

router = APIRouter(prefix="/auth/gitlab", tags=["auth"])


def _login_redirect_uri(request: Request) -> str:
    return f"{_public_base_url(request)}/auth/gitlab/callback"


def _frontend_login_complete_url(exchange: str) -> str:
    origins = settings.cors_origins_list
    base = origins[0] if origins else ""
    return f"{base}/login/gitlab-complete?exchange={quote(exchange)}"


def _frontend_login_error_url(message: str) -> str:
    origins = settings.cors_origins_list
    base = origins[0] if origins else ""
    return f"{base}/login?gitlab_error={quote(message)}"


async def _find_or_create_user(gitlab_user: dict, connection: GitLabConnection, db: AsyncSession) -> User:
    gitlab_id = gitlab_user["id"]
    username = gitlab_user.get("username")
    email = gitlab_user.get("email")

    result = await db.execute(
        select(User).where(User.gitlab_connection_id == connection.id, User.gitlab_user_id == gitlab_id)
    )
    user = result.scalar_one_or_none()
    if user is not None:
        return user

    if email:
        result = await db.execute(select(User).where(User.email == email))
        user = result.scalar_one_or_none()
        if user is not None:
            user.gitlab_connection_id = connection.id
            user.gitlab_user_id = gitlab_id
            user.gitlab_username = username
            return user

    if not email:
        raise GitLabOAuthError("Your GitLab account has no email address to sign in with")

    user = User(
        email=email,
        name=gitlab_user.get("name") or username or email,
        hashed_password=hash_password(secrets.token_urlsafe(32)),
        gitlab_connection_id=connection.id,
        gitlab_user_id=gitlab_id,
        gitlab_username=username,
    )
    db.add(user)
    await db.flush()
    return user


@router.get("/providers", response_model=list[GitLabLoginProvider])
async def list_gitlab_login_providers(db: AsyncSession = Depends(get_db)) -> list[GitLabLoginProvider]:
    result = await db.execute(
        select(GitLabConnection.org_id, GitLabConnection.base_url).where(
            GitLabConnection.encrypted_token.is_not(None)
        )
    )
    return [GitLabLoginProvider(org_id=org_id, base_url=base_url) for org_id, base_url in result.all()]


@router.post("/login/start", response_model=GitLabLoginStartOut)
async def start_gitlab_login(
    payload: GitLabLoginStart, request: Request, db: AsyncSession = Depends(get_db)
) -> GitLabLoginStartOut:
    connection = await _get_connection(payload.org_id, db)
    if connection is None or connection.encrypted_token is None or not connection.client_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="GitLab sign-in isn't available for that organization"
        )

    redirect_uri = _login_redirect_uri(request)
    state = make_state("gitlab_login", org_id=payload.org_id, redirect_uri=redirect_uri)
    authorize_url = build_authorize_url(connection.base_url, connection.client_id, redirect_uri, state)
    return GitLabLoginStartOut(authorize_url=authorize_url)


@router.get("/callback")
async def gitlab_login_callback(
    request: Request,
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
    error_description: str | None = None,
    db: AsyncSession = Depends(get_db),
) -> RedirectResponse:
    if error:
        return RedirectResponse(_frontend_login_error_url(error_description or error))
    if not code or not state:
        return RedirectResponse(_frontend_login_error_url("Missing code or state"))

    try:
        claims = verify_state(state, "gitlab_login")
    except GitLabOAuthError as exc:
        return RedirectResponse(_frontend_login_error_url(str(exc)))

    org_id = claims["org_id"]
    redirect_uri = claims["redirect_uri"]

    connection = await _get_connection(org_id, db)
    if connection is None or not connection.client_id or not connection.encrypted_client_secret:
        return RedirectResponse(_frontend_login_error_url("GitLab sign-in is no longer configured"))

    try:
        tokens = await exchange_code(
            connection.base_url, connection.client_id, decrypt(connection.encrypted_client_secret), code, redirect_uri
        )
        gitlab_user = await fetch_gitlab_user(connection.base_url, tokens["access_token"])
        user = await _find_or_create_user(gitlab_user, connection, db)
    except (GitLabOAuthError, GitLabClientError) as exc:
        return RedirectResponse(_frontend_login_error_url(str(exc)))

    user.encrypted_gitlab_token = encrypt(tokens["access_token"])
    user.encrypted_gitlab_refresh_token = encrypt(tokens["refresh_token"]) if tokens.get("refresh_token") else None
    user.gitlab_token_expires_at = datetime.now(timezone.utc) + timedelta(seconds=tokens.get("expires_in", 7200))

    await db.commit()
    await db.refresh(user)

    exchange_token = create_login_exchange_code(user.id)
    return RedirectResponse(_frontend_login_complete_url(exchange_token))


@router.post("/exchange", response_model=Token)
async def gitlab_login_exchange(payload: GitLabLoginExchange, db: AsyncSession = Depends(get_db)) -> Token:
    user_id = decode_login_exchange_code(payload.exchange)
    if user_id is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="This login link has expired")

    result = await db.execute(select(User).where(User.id == int(user_id)))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="This login link has expired")

    token = create_access_token(subject=str(user.id))
    return Token(access_token=token, user=UserOut.model_validate(user))
