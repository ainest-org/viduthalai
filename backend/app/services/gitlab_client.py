import re
from urllib.parse import quote

import httpx

_MR_URL_RE = re.compile(r"^(https?://[^/]+)/(.+)/-/merge_requests/(\d+)(?:[/?#].*)?$")
_ITEM_URL_RE = re.compile(r"^(https?://[^/]+)/(.+)/-/(?:merge_requests|issues)/(\d+)(?:[/?#].*)?$")


class GitLabClientError(Exception):
    pass


def parse_mr_url(url: str) -> tuple[str, str, int]:
    """Parses a GitLab MR URL like https://gitlab.example.com/group/repo/-/merge_requests/42
    into (base_url, project_path, mr_iid)."""
    match = _MR_URL_RE.match(url.strip())
    if not match:
        raise ValueError("That doesn't look like a GitLab merge request URL")
    base_url, project_path, mr_iid = match.groups()
    return base_url, project_path, int(mr_iid)


def project_path_from_item_url(url: str) -> str | None:
    """Best-effort project path extraction from a GitLab MR/issue web_url, for display only."""
    match = _ITEM_URL_RE.match(url.strip())
    return match.group(2) if match else None


async def _get(base_url: str, access_token: str, path: str, params: dict | None = None) -> dict | list:
    url = f"{base_url.rstrip('/')}/api/v4{path}"
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(url, headers={"Authorization": f"Bearer {access_token}"}, params=params)
    if resp.status_code != 200:
        raise GitLabClientError(f"GitLab request to {path} failed (HTTP {resp.status_code})")
    return resp.json()


async def get_current_user(base_url: str, access_token: str) -> dict:
    return await _get(base_url, access_token, "/user")


async def get_merge_request(base_url: str, access_token: str, project_path: str, mr_iid: int) -> dict:
    encoded_path = quote(project_path, safe="")
    return await _get(base_url, access_token, f"/projects/{encoded_path}/merge_requests/{mr_iid}")


async def list_my_merge_requests(base_url: str, access_token: str) -> list[dict]:
    params = {"scope": "assigned_to_me", "state": "opened", "per_page": 50, "order_by": "updated_at"}
    return await _get(base_url, access_token, "/merge_requests", params)


async def list_my_issues(base_url: str, access_token: str) -> list[dict]:
    params = {"scope": "assigned_to_me", "state": "opened", "per_page": 50, "order_by": "updated_at"}
    return await _get(base_url, access_token, "/issues", params)


async def list_projects(base_url: str, access_token: str) -> list[dict]:
    """Every project this token's owner is a member of."""
    params = {"membership": "true", "order_by": "last_activity_at", "sort": "desc", "per_page": 100}
    return await _get(base_url, access_token, "/projects", params)


async def get_project(base_url: str, access_token: str, project_id: int) -> dict:
    return await _get(base_url, access_token, f"/projects/{project_id}")


async def list_branches(base_url: str, access_token: str, project_id: int) -> list[dict]:
    return await _get(base_url, access_token, f"/projects/{project_id}/repository/branches", {"per_page": 100})


async def list_project_merge_requests(base_url: str, access_token: str, project_id: int) -> list[dict]:
    params = {"state": "opened", "order_by": "updated_at", "per_page": 100}
    return await _get(base_url, access_token, f"/projects/{project_id}/merge_requests", params)


async def list_project_issues(base_url: str, access_token: str, project_id: int) -> list[dict]:
    params = {"state": "opened", "order_by": "updated_at", "per_page": 100}
    return await _get(base_url, access_token, f"/projects/{project_id}/issues", params)
