#!/usr/bin/env python3
"""EduLife OS localhost-only translator ingress relay.

The relay exposes the internal translator to the host on loopback only.
It owns no model, tenant, teacher, LessonNote, receipt, database or curriculum
authority. It accepts only authenticated, strict translation requests and
forwards only /health, /ready and /translate to the fixed internal service.
"""

from __future__ import annotations

import hmac
import http.client
import json
import os
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any


SERVICE_NAME = "edulife-lesson-note-translator-relay"
SERVICE_VERSION = "EDULIFE_TRANSLATOR_RELAY_V1"

BACKEND_HOST = os.environ.get(
    "EDULIFE_RELAY_BACKEND_HOST",
    "translator",
).strip()

BACKEND_PORT = int(
    os.environ.get(
        "EDULIFE_RELAY_BACKEND_PORT",
        "8787",
    )
)

PORT = int(
    os.environ.get(
        "EDULIFE_RELAY_PORT",
        "8787",
    )
)

PROVIDER_TOKEN = os.environ.get(
    "EDULIFE_TRANSLATION_PROVIDER_TOKEN",
    "",
)

MAX_BODY_BYTES = 200_000
BACKEND_TIMEOUT_SECONDS = 70

if BACKEND_HOST != "translator":
    raise RuntimeError("RELAY_BACKEND_HOST_INVALID")

if BACKEND_PORT != 8787:
    raise RuntimeError("RELAY_BACKEND_PORT_INVALID")

if PORT != 8787:
    raise RuntimeError("RELAY_PORT_INVALID")

if len(PROVIDER_TOKEN.encode("utf-8")) < 32:
    raise RuntimeError("RELAY_PROVIDER_TOKEN_TOO_SHORT")


def _authorized(header_value: str | None) -> bool:
    if not isinstance(header_value, str):
        return False

    prefix = "Bearer "
    if not header_value.startswith(prefix):
        return False

    candidate = header_value[len(prefix) :]

    return hmac.compare_digest(
        candidate.encode("utf-8"),
        PROVIDER_TOKEN.encode("utf-8"),
    )


class RelayHandler(BaseHTTPRequestHandler):
    server_version = "EduLifeTranslatorRelay/1"
    sys_version = ""

    def log_message(
        self,
        format: str,
        *args: Any,
    ) -> None:
        # Metadata only. Request bodies and authorization values are never logged.
        super().log_message(format, *args)

    def _send_json(
        self,
        status: int,
        payload: dict[str, Any],
    ) -> None:
        encoded = json.dumps(
            payload,
            ensure_ascii=False,
            separators=(",", ":"),
        ).encode("utf-8")

        self.send_response(status)
        self.send_header(
            "Content-Type",
            "application/json; charset=utf-8",
        )
        self.send_header(
            "Content-Length",
            str(len(encoded)),
        )
        self.send_header(
            "Cache-Control",
            "no-store",
        )
        self.send_header(
            "X-Content-Type-Options",
            "nosniff",
        )
        self.end_headers()
        self.wfile.write(encoded)

    def _error(
        self,
        status: int,
        code: str,
    ) -> None:
        self._send_json(
            status,
            {
                "ok": False,
                "error": code,
            },
        )

    def _proxy(
        self,
        method: str,
        body: bytes | None,
    ) -> None:
        connection = http.client.HTTPConnection(
            BACKEND_HOST,
            BACKEND_PORT,
            timeout=BACKEND_TIMEOUT_SECONDS,
        )

        headers = {
            "Accept": "application/json",
            "Connection": "close",
        }

        if body is not None:
            headers["Content-Type"] = "application/json"
            headers["Content-Length"] = str(len(body))

        try:
            connection.request(
                method,
                self.path,
                body=body,
                headers=headers,
            )

            response = connection.getresponse()
            payload = response.read(
                MAX_BODY_BYTES + 1,
            )

            if len(payload) > MAX_BODY_BYTES:
                self._error(
                    502,
                    "BACKEND_RESPONSE_TOO_LARGE",
                )
                return

            self.send_response(response.status)
            self.send_header(
                "Content-Type",
                response.getheader(
                    "Content-Type",
                    "application/json; charset=utf-8",
                ),
            )
            self.send_header(
                "Content-Length",
                str(len(payload)),
            )
            self.send_header(
                "Cache-Control",
                "no-store",
            )
            self.send_header(
                "X-Content-Type-Options",
                "nosniff",
            )
            self.end_headers()
            self.wfile.write(payload)
        except Exception:
            self._error(
                502,
                "BACKEND_UNAVAILABLE",
            )
        finally:
            connection.close()

    def do_GET(self) -> None:
        if self.path not in {
            "/health",
            "/ready",
        }:
            self._error(
                404,
                "NOT_FOUND",
            )
            return

        self._proxy(
            "GET",
            None,
        )

    def do_POST(self) -> None:
        if self.path != "/translate":
            self._error(
                404,
                "NOT_FOUND",
            )
            return

        if not _authorized(
            self.headers.get("Authorization"),
        ):
            self._error(
                401,
                "UNAUTHORIZED",
            )
            return

        content_type = self.headers.get(
            "Content-Type",
            "",
        )

        if not content_type.lower().startswith(
            "application/json",
        ):
            self._error(
                415,
                "JSON_REQUIRED",
            )
            return

        raw_length = self.headers.get(
            "Content-Length",
        )

        if raw_length is None:
            self._error(
                411,
                "CONTENT_LENGTH_REQUIRED",
            )
            return

        try:
            content_length = int(raw_length)
        except ValueError:
            self._error(
                400,
                "INVALID_CONTENT_LENGTH",
            )
            return

        if (
            content_length < 1
            or content_length > MAX_BODY_BYTES
        ):
            self._error(
                413,
                "REQUEST_TOO_LARGE",
            )
            return

        try:
            self.connection.settimeout(15)
            raw = self.rfile.read(
                content_length,
            )
            body = json.loads(
                raw.decode("utf-8"),
            )
        except (
            UnicodeDecodeError,
            json.JSONDecodeError,
        ):
            self._error(
                400,
                "INVALID_JSON",
            )
            return

        if (
            not isinstance(body, dict)
            or set(body.keys()) != {"text"}
            or not isinstance(body.get("text"), str)
        ):
            self._error(
                400,
                "INVALID_REQUEST_SHAPE",
            )
            return

        self._proxy(
            "POST",
            raw,
        )


def main() -> None:
    server = ThreadingHTTPServer(
        (
            "0.0.0.0",
            PORT,
        ),
        RelayHandler,
    )

    print(
        json.dumps(
            {
                "event": "translator_relay_ready",
                "service": SERVICE_NAME,
                "serviceVersion": SERVICE_VERSION,
                "backendHost": BACKEND_HOST,
                "backendPort": BACKEND_PORT,
                "bind": f"0.0.0.0:{PORT}",
            },
            separators=(",", ":"),
        ),
        flush=True,
    )

    server.serve_forever(
        poll_interval=0.5,
    )


if __name__ == "__main__":
    main()
