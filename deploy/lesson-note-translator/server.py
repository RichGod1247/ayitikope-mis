#!/usr/bin/env python3
"""EduLife OS local Helsinki en->Ewe translation service.

This service intentionally owns only model integrity, model loading and inference.
Tenant authorization, teacher authorization, LessonNote authority, protected-token
masking/restoration, rate limiting, receipts and database writes stay in Next.js.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import threading
import unicodedata
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

import torch
from transformers import AutoModelForSeq2SeqLM, AutoTokenizer


SERVICE_NAME = "edulife-lesson-note-translator"
SERVICE_VERSION = "EDULIFE_TRANSLATOR_SERVICE_V1"

PROVIDER = "HELSINKI_NLP"
MODEL_NAME = "Helsinki-NLP/opus-mt-en-ee"
MODEL_REVISION = "fef1362558b7948e5257f06f192d700761b3b57d"
MODEL_AUTHORITY = "EDULIFE_MODEL_AUTHORITY_V1"
SOURCE_LANGUAGE = "en"
TARGET_LANGUAGE = "ee"

PROTECTED_CURRICULUM_CODE_PATTERN = re.compile(
    r"\b[A-Za-z]{1,8}\d{1,3}(?:\.\d{1,4}){2,8}\b"
)
LEGACY_PROTECTED_PLACEHOLDER_PREFIX = "ZXQEDULIFEPT"

EXPECTED_FILES = {
    "config.json": "23023B78AB82577D8F1D00509717EFC932BBE5F5BA78EDAB77D0E27418562BF3",
    "pytorch_model.bin": "8A4884D69C35E84E0E78FC3A56E0D70FBFAA99904AF96219D5F23E1D244B49AE",
    "source.spm": "F183389C6FAB3DF8A90239B92146F07F595241C40C7FA034CF5A0BC4D78CCA29",
    "target.spm": "C66F6AFFA60CD6F5FB9F23277EFEEB232B8D0839E5F11E9352F343A6A7DC6085",
    "vocab.json": "3ED25C1B230D2D820EDFA31633F7B94EF6A2E117BF7127C0C4E0F840E64AA065",
}
EXPECTED_MANIFEST_SHA256 = "23B1A8406F4DA26AD8C668D4D41FEEA7207B5D4AF7C7204387CC1F938A544185"

MAX_BODY_BYTES = 200_000
MAX_TEXT_CHARS = 50_000
MODEL_TOKEN_BUDGET = 400
MODEL_MAX_NEW_TOKENS = 511

MODEL_PATH = Path(os.environ.get("EDULIFE_TRANSLATOR_MODEL_PATH", "/model"))
HOST = os.environ.get("EDULIFE_TRANSLATOR_HOST", "0.0.0.0").strip() or "0.0.0.0"
PORT = int(os.environ.get("EDULIFE_TRANSLATOR_PORT", "8787"))
TORCH_THREADS = max(1, min(4, int(os.environ.get("EDULIFE_TRANSLATOR_TORCH_THREADS", "2"))))

_tokenizer: Any = None
_model: Any = None
_inference_lock = threading.Lock()


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        while True:
            chunk = handle.read(1024 * 1024)
            if not chunk:
                break
            digest.update(chunk)
    return digest.hexdigest().upper()


def _verify_model_authority() -> None:
    if not MODEL_PATH.is_dir():
        raise RuntimeError("MODEL_AUTHORITY_DIRECTORY_MISSING")

    manifest = MODEL_PATH / "EDULIFE_MODEL_AUTHORITY_V1.txt"
    if not manifest.is_file():
        raise RuntimeError("MODEL_AUTHORITY_MANIFEST_MISSING")

    if _sha256(manifest) != EXPECTED_MANIFEST_SHA256:
        raise RuntimeError("MODEL_AUTHORITY_MANIFEST_HASH_DRIFT")

    for name, expected_sha in EXPECTED_FILES.items():
        path = MODEL_PATH / name
        if not path.is_file():
            raise RuntimeError(f"MODEL_AUTHORITY_FILE_MISSING:{name}")
        if _sha256(path) != expected_sha:
            raise RuntimeError(f"MODEL_AUTHORITY_FILE_HASH_DRIFT:{name}")


def _load_model() -> None:
    global _tokenizer, _model

    _verify_model_authority()

    torch.set_num_threads(TORCH_THREADS)

    _tokenizer = AutoTokenizer.from_pretrained(
        str(MODEL_PATH),
        local_files_only=True,
    )
    _model = AutoModelForSeq2SeqLM.from_pretrained(
        str(MODEL_PATH),
        local_files_only=True,
    )
    _model.eval()


def _chunk_core(core: str) -> list[str]:
    assert _tokenizer is not None

    token_ids = _tokenizer(
        core,
        add_special_tokens=False,
        return_attention_mask=False,
        return_token_type_ids=False,
    )["input_ids"]

    if len(token_ids) <= MODEL_TOKEN_BUDGET:
        return [core]

    chunks: list[str] = []
    for start in range(0, len(token_ids), MODEL_TOKEN_BUDGET):
        ids = token_ids[start : start + MODEL_TOKEN_BUDGET]
        chunk = _tokenizer.decode(
            ids,
            skip_special_tokens=True,
            clean_up_tokenization_spaces=False,
        ).strip()
        if chunk:
            chunks.append(chunk)

    if not chunks:
        raise RuntimeError("TEXT_CHUNKING_FAILED")

    return chunks


def _translate_core(core: str) -> str:
    assert _tokenizer is not None
    assert _model is not None

    translated_chunks: list[str] = []

    for chunk in _chunk_core(core):
        encoded = _tokenizer(
            chunk,
            return_tensors="pt",
            truncation=False,
        )

        input_tokens = int(encoded["input_ids"].shape[1])
        if input_tokens > 512:
            raise RuntimeError("MODEL_INPUT_TOKEN_LIMIT_EXCEEDED")

        with torch.inference_mode():
            generated = _model.generate(
                **encoded,
                max_new_tokens=MODEL_MAX_NEW_TOKENS,
                num_beams=4,
            )

        translated = _tokenizer.batch_decode(
            generated,
            skip_special_tokens=True,
            clean_up_tokenization_spaces=False,
        )[0].strip()

        if not translated:
            raise RuntimeError("EMPTY_MODEL_TRANSLATION")

        translated_chunks.append(translated)

    return " ".join(translated_chunks)


def _translate_text(text: str) -> str:
    # Preserve line-boundary structure while translating only non-whitespace text.
    pieces = re.split(r"(\r\n|\n|\r)", text)
    output: list[str] = []

    with _inference_lock:
        for piece in pieces:
            if piece in ("\r\n", "\n", "\r"):
                output.append(piece)
                continue

            if not piece:
                continue

            leading_len = len(piece) - len(piece.lstrip())
            trailing_len = len(piece) - len(piece.rstrip())

            leading = piece[:leading_len]
            trailing = piece[len(piece) - trailing_len :] if trailing_len else ""
            core_end = len(piece) - trailing_len if trailing_len else len(piece)
            core = piece[leading_len:core_end]

            if not core:
                output.append(piece)
                continue

            output.append(leading + _translate_core(core) + trailing)

    return "".join(output)


def _metadata() -> dict[str, Any]:
    return {
        "service": SERVICE_NAME,
        "serviceVersion": SERVICE_VERSION,
        "provider": PROVIDER,
        "model": MODEL_NAME,
        "modelRevision": MODEL_REVISION,
        "modelAuthority": MODEL_AUTHORITY,
        "sourceLanguage": SOURCE_LANGUAGE,
        "targetLanguage": TARGET_LANGUAGE,
    }


class TranslatorHandler(BaseHTTPRequestHandler):
    server_version = "EduLifeTranslator/1"
    sys_version = ""

    def log_message(self, format: str, *args: Any) -> None:
        # The default log contains only request metadata, never the request body.
        super().log_message(format, *args)

    def _send_json(self, status: int, payload: dict[str, Any]) -> None:
        encoded = json.dumps(
            payload,
            ensure_ascii=False,
            separators=(",", ":"),
        ).encode("utf-8")

        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(encoded)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(encoded)

    def _error(self, status: int, code: str) -> None:
        self._send_json(
            status,
            {
                "ok": False,
                "error": code,
            },
        )

    def do_GET(self) -> None:
        if self.path == "/health":
            self._send_json(
                200,
                {
                    "ok": True,
                    "status": "alive",
                    **_metadata(),
                },
            )
            return

        if self.path == "/ready":
            ready = _tokenizer is not None and _model is not None
            self._send_json(
                200 if ready else 503,
                {
                    "ok": ready,
                    "status": "ready" if ready else "not_ready",
                    **_metadata(),
                },
            )
            return

        self._error(404, "NOT_FOUND")

    def do_POST(self) -> None:
        if self.path != "/translate":
            self._error(404, "NOT_FOUND")
            return

        content_type = self.headers.get("Content-Type", "")
        if not content_type.lower().startswith("application/json"):
            self._error(415, "JSON_REQUIRED")
            return

        raw_length = self.headers.get("Content-Length")
        if raw_length is None:
            self._error(411, "CONTENT_LENGTH_REQUIRED")
            return

        try:
            content_length = int(raw_length)
        except ValueError:
            self._error(400, "INVALID_CONTENT_LENGTH")
            return

        if content_length < 1 or content_length > MAX_BODY_BYTES:
            self._error(413, "REQUEST_TOO_LARGE")
            return

        try:
            self.connection.settimeout(15)
            raw = self.rfile.read(content_length)
            body = json.loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            self._error(400, "INVALID_JSON")
            return

        if not isinstance(body, dict) or set(body.keys()) != {"text"}:
            self._error(400, "INVALID_REQUEST_SHAPE")
            return

        text = body.get("text")
        if not isinstance(text, str):
            self._error(400, "TEXT_REQUIRED")
            return

        if len(text) > MAX_TEXT_CHARS:
            self._error(413, "TEXT_TOO_LONG")
            return

        if not text.strip():
            self._error(400, "TEXT_EMPTY")
            return

        if unicodedata.normalize("NFC", text) != text:
            self._error(422, "TEXT_NOT_NFC")
            return

        if (
            PROTECTED_CURRICULUM_CODE_PATTERN.search(text)
            or LEGACY_PROTECTED_PLACEHOLDER_PREFIX in text
        ):
            self._error(422, "PROTECTED_TOKEN_PRESENT")
            return

        try:
            translation = _translate_text(text)
        except Exception:
            # Do not expose model/runtime internals to callers.
            self._error(502, "TRANSLATION_FAILED")
            return

        self._send_json(
            200,
            {
                "ok": True,
                "translation": translation,
                **_metadata(),
            },
        )


def main() -> None:
    _load_model()
    server = ThreadingHTTPServer((HOST, PORT), TranslatorHandler)
    print(
        json.dumps(
            {
                "event": "translator_ready",
                "bind": f"{HOST}:{PORT}",
                **_metadata(),
            },
            separators=(",", ":"),
        ),
        flush=True,
    )
    server.serve_forever(poll_interval=0.5)


if __name__ == "__main__":
    main()
