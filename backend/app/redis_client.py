import json
from typing import Any

from redis.asyncio import Redis, from_url

from app.config import settings

redis_client: Redis = from_url(settings.redis_url, decode_responses=True)


async def cache_get(key: str) -> Any | None:
    value = await redis_client.get(key)
    if value is None:
        return None
    return json.loads(value)


async def cache_set(key: str, value: Any, ttl_seconds: int = 60) -> None:
    await redis_client.set(key, json.dumps(value), ex=ttl_seconds)


async def cache_delete(*keys: str) -> None:
    if keys:
        await redis_client.delete(*keys)
