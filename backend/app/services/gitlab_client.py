import re
from urllib.parse import quote

import httpx

_MR_URL_RE = re.compile(r"^(https?://[^/]+)/(.+)/-/merge_requests/(\d+)(?:[/?#].*)?$")


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


async def get_current_user(base_url: str, token: str) -> dict:
    url = f"{base_url.rstrip('/')}/api/v4/user"
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(url, headers={"PRIVATE-TOKEN": token})
    if resp.status_code != 200:
        raise GitLabClientError(f"GitLab rejected the token (HTTP {resp.status_code})")
    return resp.json()


async def get_merge_request(base_url: str, token: str, project_path: str, mr_iid: int) -> dict:
    encoded_path = quote(project_path, safe="")
    url = f"{base_url.rstrip('/')}/api/v4/projects/{encoded_path}/merge_requests/{mr_iid}"
    async with httpx.AsyncClient(timeout=10) as client:
        resp = await client.get(url, headers={"PRIVATE-TOKEN": token})
    if resp.status_code != 200:
        raise GitLabClientError(f"Could not fetch that merge request from GitLab (HTTP {resp.status_code})")
    return resp.json()
