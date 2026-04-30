import os
import redis
import logging
from cachetools import TTLCache
from logging_config import setup_logging
from redis.retry import Retry
from redis.backoff import ExponentialBackoff
# Logger for cache events
setup_logging()
logger = logging.getLogger(__name__)

REDIS_HOST = os.getenv("REDIS_HOST", "redis")
REDIS_PORT = int(os.getenv("REDIS_PORT", 6379))

# Retry strategy: exponential backoff (max 5 retries)
retry_strategy = Retry(
    backoff=ExponentialBackoff(cap=2, base=0.1),
    retries=5
)

# Connection pool
pool = redis.ConnectionPool(
    host=REDIS_HOST,
    port=REDIS_PORT,
    decode_responses=True,
    socket_connect_timeout=2,
    socket_timeout=2,
    max_connections=40  # prevents overload
)

# Redis client with retry
redis_client = redis.Redis(
    connection_pool=pool,
    retry=retry_strategy,
    retry_on_error=[
        redis.exceptions.ConnectionError,
        redis.exceptions.TimeoutError
    ]
)

# In-memory TTL cache (fast access layer)
# maxsize prevents memory leaks
# ttl ensures objects expire automatically
vector_cache = TTLCache(maxsize=500, ttl=600)
sql_cache = TTLCache(maxsize=200, ttl=600)

# startup check
def check_redis():
    try:
        redis_client.ping()
        logger.info(f"Redis connected at {REDIS_HOST}:{REDIS_PORT}")
    except Exception as e:
        logger.error(f"Redis connection failed: {e}")
        raise

check_redis()

logger.info("Cache layer initialized.")