"""Request-level hardening for the public demo.

Three ASGI middlewares, all independent of the routes they protect:

* ``BodySizeLimit``    refuses oversized request bodies while they stream in.
* ``ProbeGuard``       answers exploit probes without touching the filesystem
                       and bans addresses that keep scanning.
* ``SecurityHeaders``  adds the browser-side protections to every response.

They are pure ASGI rather than ``BaseHTTPMiddleware`` because the body limit
has to wrap ``receive`` itself — the only place an upload can be stopped
before the framework has already spooled all of it to disk.

The client address used throughout is the one uvicorn resolved: it honours
X-Forwarded-For only from addresses in ``--forwarded-allow-ips`` (127.0.0.1 by
default, i.e. a reverse proxy or tunnel on the same machine). Reading the
header directly would let any caller pick their own identity per request.
"""

from __future__ import annotations

import json
import re
import sys
import time
from collections import deque

from .config import settings

Scope = dict
_JSON = [(b"content-type", b"application/json")]


def client_host(scope: Scope) -> str:
    client = scope.get("client")
    return client[0] if client else "unknown"


async def _send_json(send, status: int, body: dict, extra_headers=None) -> None:
    payload = json.dumps(body).encode()
    headers = _JSON + [(b"content-length", str(len(payload)).encode())]
    headers += extra_headers or []
    await send({"type": "http.response.start", "status": status, "headers": headers})
    await send({"type": "http.response.body", "body": payload})


# --------------------------------------------------------------- body limit
class _BodyTooLarge(Exception):
    pass


class BodySizeLimit:
    """Reject request bodies larger than ``max_bytes``.

    Without this the 2 MB upload limit was checked inside the endpoint, after
    the multipart parser had already received the whole body and written it to
    a temporary file: a 30 MB upload was accepted in full and only then
    refused, so a large enough one fills the disk.

    A declared Content-Length over the limit is refused before a byte of body
    is read. Bodies without one (chunked) are counted as they arrive and cut
    off at the limit.
    """

    def __init__(self, app, max_bytes: int):
        self.app = app
        self.max_bytes = max_bytes

    async def _reject(self, send) -> None:
        mb = max(1, settings.MAX_FILE_SIZE_BYTES // (1024 * 1024))
        await _send_json(send, 413, {
            "error": f"Request body too large. Demo limit is {mb} MB.",
            "code": "FILE_TOO_LARGE", "params": {"mb": mb},
        }, [(b"connection", b"close")])

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or scope["method"] in ("GET", "HEAD", "OPTIONS"):
            await self.app(scope, receive, send)
            return

        declared = dict(scope.get("headers") or []).get(b"content-length")
        if declared is not None:
            try:
                size = int(declared)
            except ValueError:
                await _send_json(send, 400, {"error": "Invalid Content-Length."})
                return
            if size > self.max_bytes:
                await self._reject(send)
                return

        state = {"seen": 0, "exceeded": False, "started": False}

        async def limited_receive():
            message = await receive()
            if message["type"] == "http.request":
                state["seen"] += len(message.get("body", b""))
                if state["seen"] > self.max_bytes:
                    state["exceeded"] = True
                    raise _BodyTooLarge()
            return message

        async def guarded_send(message):
            # Once the limit is hit, whatever the app was about to answer
            # (FastAPI turns a body error into a 400) is replaced by the 413.
            if state["exceeded"]:
                return
            if message["type"] == "http.response.start":
                state["started"] = True
            await send(message)

        try:
            await self.app(scope, limited_receive, guarded_send)
        except _BodyTooLarge:
            pass
        except Exception:
            if not state["exceeded"]:
                raise
        if state["exceeded"] and not state["started"]:
            await self._reject(send)


# ------------------------------------------------------------- probe guard
# Paths no page of this site will ever request, and every internet-wide
# scanner does: credentials and VCS dumps, CMS admin panels, framework
# consoles, and lately MCP / SSE endpoints. Anchored at the start of the path
# so that /api/config, /vendor/charting.js and the samples never match.
_PROBE = re.compile(
    r"""^/(?:
        \.(?:env|git|svn|hg|aws|ssh|docker|vscode|idea|ds_store|htaccess|htpasswd)\b
      | (?:wp-|wordpress|xmlrpc|phpmyadmin|pma\b|myadmin|adminer|administrator|admin\b)
      | (?:cgi-bin|actuator|server-status|server-info|jmx-console|manager/html|solr|druid
          |boaform|hnap1|owa\b|ecp\b|telescope|_ignition|console\b|debug\b)
      | (?:mcp|sse|api/mcp|api/sse|api/settings|api/v\d|graphql|swagger|api-docs|v\d/api-docs)
      | (?:vendor/phpunit|config\.(?:json|php|ya?ml|js)|backup|dump)
      | .*\.(?:php\d?|asp|aspx|jsp|cgi|pl|bak|old|orig|swp|sql|sqlite|db|env|ini|log
              |conf|tar|tgz|gz|zip|rar|7z)$
    )""",
    re.IGNORECASE | re.VERBOSE,
)

# Requested by real browsers and well-behaved crawlers on their own accord.
# Never scored, whether or not they exist.
_BENIGN = re.compile(
    r"^/(?:favicon\.(?:ico|svg|png)|apple-touch-icon[\w.-]*\.png|robots\.txt"
    r"|sitemap\.xml|\.well-known/.*)$",
    re.IGNORECASE,
)

_EXEMPT = {"127.0.0.1", "::1", "localhost"}


class ProbeGuard:
    """Answer exploit probes cheaply and ban addresses that keep scanning.

    A probe gets a plain 404 straight from here — no filesystem lookup, which
    is also what a crafted path would otherwise exercise — and scores 5. Any
    other 404 scores 1. An address that reaches the threshold within the
    window is answered 403 on every path until the ban expires.

    This is a speed bump, not a wall: a scanner rotating addresses is
    unaffected, and the real place to block traffic is an edge proxy or the
    host firewall. What it does is stop one address from walking the whole
    site, and keep the log readable.
    """

    def __init__(self, app, enabled: bool, threshold: int, window: int, ban_seconds: int):
        self.app = app
        self.enabled = enabled
        self.threshold = threshold
        self.window = window
        self.ban_seconds = ban_seconds
        self._scores: dict[str, deque] = {}
        self._banned: dict[str, float] = {}
        self._calls = 0

    def _sweep(self, now: float) -> None:
        for ip in [ip for ip, until in self._banned.items() if until <= now]:
            del self._banned[ip]
        cutoff = now - self.window
        for ip in list(self._scores):
            dq = self._scores[ip]
            while dq and dq[0][0] <= cutoff:
                dq.popleft()
            if not dq:
                del self._scores[ip]

    def _score(self, ip: str, points: int, path: str, now: float) -> None:
        dq = self._scores.setdefault(ip, deque())
        cutoff = now - self.window
        while dq and dq[0][0] <= cutoff:
            dq.popleft()
        dq.append((now, points, path))
        total = sum(p for _, p, _ in dq)
        if total >= self.threshold:
            self._banned[ip] = now + self.ban_seconds
            recent = ", ".join(dict.fromkeys(p for _, _, p in list(dq)[-4:]))
            print(f"[guard] banned {ip} for {self.ban_seconds // 60} min "
                  f"(score {total} in {self.window // 60} min; recent: {recent})",
                  file=sys.stderr)
            del self._scores[ip]

    async def __call__(self, scope, receive, send):
        if not self.enabled or scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        now = time.monotonic()
        self._calls += 1
        if self._calls % 500 == 0:
            self._sweep(now)

        ip = client_host(scope)
        path = scope.get("path", "")

        if ip in _EXEMPT:
            await self.app(scope, receive, send)
            return

        until = self._banned.get(ip)
        if until is not None:
            if until > now:
                await _send_json(send, 403, {"error": "Forbidden."})
                return
            del self._banned[ip]

        if _PROBE.match(path):
            self._score(ip, 5, path[:60], now)
            await _send_json(send, 404, {"error": "Not found."})
            return

        status = {}

        async def watching_send(message):
            if message["type"] == "http.response.start":
                status["code"] = message["status"]
            await send(message)

        await self.app(scope, receive, watching_send)

        if status.get("code") == 404 and not _BENIGN.match(path):
            self._score(ip, 1, path[:60], now)


# --------------------------------------------------------- security headers
# The page loads only its own scripts and styles, talks only to its own API,
# and draws favicons and chart exports from data: and blob: URLs. Inline style
# attributes stay allowed because the chart library and the tooltip set them;
# inline and eval'd script do not, which is the part of CSP that stops an
# injected script from running.
_CSP = "; ".join([
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
])

_HEADERS = [
    (b"content-security-policy", _CSP.encode()),
    (b"x-content-type-options", b"nosniff"),
    (b"x-frame-options", b"DENY"),
    (b"referrer-policy", b"strict-origin-when-cross-origin"),
    (b"permissions-policy",
     b"camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()"),
    (b"cross-origin-opener-policy", b"same-origin"),
]


class SecurityHeaders:
    """Add the browser-side protections to every response, errors included."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        async def send_with_headers(message):
            if message["type"] == "http.response.start":
                present = {k.lower() for k, _ in message.get("headers", [])}
                extra = [(k, v) for k, v in _HEADERS if k not in present]
                message = {**message, "headers": list(message.get("headers", [])) + extra}
            await send(message)

        await self.app(scope, receive, send_with_headers)
