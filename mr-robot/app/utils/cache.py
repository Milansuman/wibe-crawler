"""Redis caching utilities for agent operations."""
import logging
import json
import hashlib
from typing import Any
from datetime import datetime

logger = logging.getLogger("PentestAgent")

try:
    import redis
    from config import env
    
    # Initialize Redis client
    redis_client = redis.from_url(
        env.REDIS_URL,
        decode_responses=True,
        socket_connect_timeout=5,
        socket_timeout=5
    )
    # Test connection
    redis_client.ping()
    REDIS_AVAILABLE = True
    logger.info("✅ Redis cache connected successfully")
except Exception as e:
    redis_client = None
    REDIS_AVAILABLE = False
    logger.warning(f"⚠️  Redis cache not available: {e}. Caching disabled.")


def generate_cache_key(prefix: str, data: Any) -> str:
    """Generate a cache key from data using SHA256 hash."""
    data_str = json.dumps(data, sort_keys=True, default=str)
    hash_obj = hashlib.sha256(data_str.encode())
    return f"{prefix}:{hash_obj.hexdigest()}"


def get_from_cache(key: str) -> Any | None:
    """Get data from Redis cache."""
    if not REDIS_AVAILABLE or redis_client is None:
        return None
    
    try:
        cached = redis_client.get(key)
        if cached:
            return json.loads(str(cached))
        return None
    except Exception as e:
        logger.debug(f"Cache read error: {e}")
        return None


def set_in_cache(key: str, value: Any, ttl: int = 3600) -> None:
    """Set data in Redis cache with TTL (default 1 hour)."""
    if not REDIS_AVAILABLE or redis_client is None:
        return
    
    try:
        redis_client.setex(key, ttl, json.dumps(value, default=str))
    except Exception as e:
        logger.debug(f"Cache write error: {e}")


def is_cache_available() -> bool:
    """Check if Redis cache is available."""
    return REDIS_AVAILABLE


__all__ = [
    "generate_cache_key",
    "get_from_cache", 
    "set_in_cache",
    "is_cache_available",
    "REDIS_AVAILABLE"
]
