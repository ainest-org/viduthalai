from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode

import httpx
import jwt
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models.gitlab_connection import GitLabConnection
from app.models.user import User
from app.services.crypto import decrypt, encrypt

_STATE_TTL_MINUTES = 10
_DEFAULT_SCOPE = "read_api"


class GitLabOAuthError(Exception):
    pass


def build_authorize_url(base_url: str, client_id: str, redirect_uri: str, state: str) -> str:
    params = {
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": _DEFAULT_SCOPE,
        "state": state,
    }
    return f"{base_url.rstrip('/')}/oauth/authorize?{urlencode(params)}"


def make_state(purpose: str, **claims: object) -> str:
    payload = {
        "purpose": purpose,
        **claims,
        "exp": datetime.now(timezone.utc) + timedelta(minutes=_STATE_TTL_MINUTES),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def verify_state(state: str, expected_purpose: str) -> dict:
    try:
        payload = jwt.decode(state, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    except jwt.PyJWTError as exc:
        raise GitLabOAuthError("That link has expired or is invalid — try again") from exc
    if payload.get("purpose") != expected_purpose:
        raise GitLabOAuthError("Invalid OAuth state")
    return payload


async def exchange_code(base_url: str, client_id: str, client_secret: str, code: str, redirect_uri: str) -> dict:
    url = f"{base_url.rstrip('/')}/oauth/token"
    data = {
        "client_id": client_id,
        "client_secret": client_secret,
        "code": code,
        "grant_type": "authorization_code",
        "redirect_uri": redirect_uri,
    }
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.post(url, data=data)
    if resp.status_code != 200:
        raise GitLabOAuthError(f"GitLab rejected the OAuth code exchange (HTTP {resp.status_code})")
    return resp.json()


async def refresh_access_token(base_url: str, client_id: str, client_secret: str, refresh_token: str) -> dict:
    url = f"{base_url.rstrip('/')}/oauth/token"
    data = {
        "client_id": client_id,
        "client_secret": client_secret,
        "refresh_token": refresh_token,
        "grant_type": "refresh_token",
    }
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.post(url, data=data)
    if resp.status_code != 200:
        raise GitLabOAuthError(f"GitLab rejected the token refresh (HTTP {resp.status_code}) — reconnect")
    return resp.json()


async def get_valid_access_token(connection: GitLabConnection, db: AsyncSession) -> str:
    """Returns a usable access token, refreshing it first if it's expired or about to be."""
    expires_soon = connection.token_expires_at is not None and connection.token_expires_at <= (
        datetime.now(timezone.utc) + timedelta(seconds=60)
    )
    if expires_soon:
        if not connection.encrypted_refresh_token or not connection.client_id or not connection.encrypted_client_secret:
            raise GitLabOAuthError("GitLab connection has expired — reconnect in organization settings")

        refreshed = await refresh_access_token(
            connection.base_url,
            connection.client_id,
            decrypt(connection.encrypted_client_secret),
            decrypt(connection.encrypted_refresh_token),
        )
        connection.encrypted_token = encrypt(refreshed["access_token"])
        if refreshed.get("refresh_token"):
            connection.encrypted_refresh_token = encrypt(refreshed["refresh_token"])
        connection.token_expires_at = datetime.now(timezone.utc) + timedelta(
            seconds=refreshed.get("expires_in", 7200)
        )
        await db.commit()

    if not connection.encrypted_token:
        raise GitLabOAuthError("GitLab isn't connected yet")
    return decrypt(connection.encrypted_token)


async def get_valid_user_gitlab_token(user: User, db: AsyncSession) -> str:
    """Same idea as get_valid_access_token, but for a user's personal GitLab login token —
    refreshed using the OAuth app credentials of the org connection that issued it."""
    if not user.encrypted_gitlab_token or not user.gitlab_connection_id:
        raise GitLabOAuthError("This account isn't signed in with GitLab")

    expires_soon = user.gitlab_token_expires_at is not None and user.gitlab_token_expires_at <= (
        datetime.now(timezone.utc) + timedelta(seconds=60)
    )
    if expires_soon:
        connection = user.gitlab_connection
        if not connection or not user.encrypted_gitlab_refresh_token:
            raise GitLabOAuthError("Your GitLab session has expired — sign in with GitLab again")

        refreshed = await refresh_access_token(
            connection.base_url,
            connection.client_id,
            decrypt(connection.encrypted_client_secret),
            decrypt(user.encrypted_gitlab_refresh_token),
        )
        user.encrypted_gitlab_token = encrypt(refreshed["access_token"])
        if refreshed.get("refresh_token"):
            user.encrypted_gitlab_refresh_token = encrypt(refreshed["refresh_token"])
        user.gitlab_token_expires_at = datetime.now(timezone.utc) + timedelta(
            seconds=refreshed.get("expires_in", 7200)
        )
        await db.commit()

    return decrypt(user.encrypted_gitlab_token)
