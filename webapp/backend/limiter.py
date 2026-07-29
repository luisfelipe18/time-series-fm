"""A tiny in-memory sliding-window rate limiter.

Good enough for a single-process demo. For a multi-worker / multi-host
deployment swap this for Redis.
"""

from __future__ import annotations

import threading
import time
from collections import defaultdict, deque


class RateLimiter:
    def __init__(self, limit: int, window_sec: int) -> None:
        self.limit = limit
        self.window = window_sec
        self._hits: dict[str, deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def _prune(self, dq: deque[float], now: float) -> None:
        cutoff = now - self.window
        while dq and dq[0] <= cutoff:
            dq.popleft()

    def check(self, key: str) -> tuple[bool, int, int]:
        """Try to consume one token.

        Returns (allowed, retry_after_sec, remaining).
        """
        now = time.time()
        with self._lock:
            dq = self._hits[key]
            self._prune(dq, now)
            if len(dq) >= self.limit:
                retry_after = int(self.window - (now - dq[0])) + 1
                return False, max(1, retry_after), 0
            dq.append(now)
            return True, 0, self.limit - len(dq)

    def remaining(self, key: str) -> int:
        now = time.time()
        with self._lock:
            dq = self._hits[key]
            self._prune(dq, now)
            return max(0, self.limit - len(dq))
