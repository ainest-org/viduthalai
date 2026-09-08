from redis import Redis
from rq import Queue

from app.config import settings

redis_conn = Redis.from_url(settings.redis_url)
webhook_queue = Queue("gitlab_webhooks", connection=redis_conn)
