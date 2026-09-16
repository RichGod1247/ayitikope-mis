# Local pilot image: reuse the exact already-banked Helsinki CPU runtime.
# Build gate MUST relock this local tag to:
# sha256:97c2ba7990456b08501d2b4467273a900728e23ae3be8f1d231a752ee9290556
FROM edulife-translator-benchmark:gl-t1-p2-b1

WORKDIR /service

ENV HF_HUB_OFFLINE=1 \
    TRANSFORMERS_OFFLINE=1 \
    TOKENIZERS_PARALLELISM=false \
    PYTHONDONTWRITEBYTECODE=1 \
    EDULIFE_TRANSLATOR_MODEL_PATH=/model \
    EDULIFE_TRANSLATOR_HOST=0.0.0.0 \
    EDULIFE_TRANSLATOR_PORT=8787 \
    EDULIFE_TRANSLATOR_TORCH_THREADS=2

COPY deploy/lesson-note-translator/server.py /service/server.py
COPY deploy/lesson-note-translator-relay/relay.py /service/relay.py

# Arbitrary non-root numeric identity; the model bind mount is read-only.
USER 65532:65532

EXPOSE 8787

STOPSIGNAL SIGTERM

CMD ["python3", "/service/server.py"]
