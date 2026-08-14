"""
Per-client rate limiting for the unauthenticated, compute-expensive
detection endpoints.

These endpoints run YOLO inference per request, and /detect-product-brand
additionally proxies to the *paid* Google Vision API -- without a limit, a
single anonymous caller can exhaust compute or run up the Vision bill in a
loop. Limits are per (path, client) over a sliding window.

Deliberately dependency-free and in-memory: correct for the single-process
uvicorn deployment this project uses. A multi-process/multi-instance
deployment needs a shared store (e.g. Redis) instead -- noted in
docs/SecurityAudit.md.

Set RATE_LIMIT_DISABLED=1 to switch the middleware off (used by the test
suite, and available for local development).
"""
import time
from collections import defaultdict, deque

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

WINDOW_SECONDS = 60

# Requests allowed per WINDOW_SECONDS, per client, per path. Sized from the
# app's own call patterns with headroom: the scan screen polls /detect about
# once per second, the legacy AR path polls /detect-face-mesh at ~2/second,
# and /detect-product-brand fires once per detection tap (and spends money).
DEFAULT_LIMITS = {
    "/detect": 90,
    "/detect-with-image": 30,
    "/detect-face-mesh": 150,
    "/detect-product-brand": 10,
}


def _client_ip(request) -> str:
    return request.client.host if request.client else "unknown"


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Sliding-window limiter. `key_func` and `clock` are injectable so tests
    can control identity and time deterministically."""

    def __init__(self, app, limits=None, window=WINDOW_SECONDS,
                 key_func=_client_ip, clock=time.monotonic):
        super().__init__(app)
        self.limits = DEFAULT_LIMITS if limits is None else limits
        self.window = window
        self.key_func = key_func
        self.clock = clock
        self._hits = defaultdict(deque)

    async def dispatch(self, request, call_next):
        limit = self.limits.get(request.url.path)
        if limit is None:
            return await call_next(request)

        now = self.clock()
        key = (request.url.path, self.key_func(request))
        hits = self._hits[key]
        while hits and hits[0] <= now - self.window:
            hits.popleft()
        if not hits:
            # Don't let one-off clients accumulate empty deques forever.
            self._hits.pop(key, None)
            hits = self._hits[key]

        if len(hits) >= limit:
            retry_after = max(1, int(hits[0] + self.window - now) + 1)
            return JSONResponse(
                status_code=429,
                content={"detail": "Too many requests. Try again shortly."},
                headers={"Retry-After": str(retry_after)},
            )

        hits.append(now)
        return await call_next(request)
