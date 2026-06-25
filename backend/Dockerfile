# ── Augur backend image ──────────────────────────────────────────────────────
# Prophet needs a C++ toolchain to build its Stan backend, so we install it in
# a builder-friendly slim image. The app degrades to the statistical detector
# if Prophet fails to import, so the container always starts.
# FROM python:3.11-slim

# ENV PYTHONUNBUFFERED=1 \
#     PYTHONDONTWRITEBYTECODE=1 \
#     PIP_NO_CACHE_DIR=1

# # Build deps for prophet/cmdstan + curl for healthcheck
# RUN apt-get update && apt-get install -y --no-install-recommends \
#     build-essential gcc g++ curl \
#     && rm -rf /var/lib/apt/lists/*

# WORKDIR /app

# COPY requirements.txt .
# RUN pip install --upgrade pip && pip install -r requirements.txt

# COPY . .

# # BACKEND_PORT is injected by docker-compose; default 8100.
# ENV BACKEND_PORT=8100
# EXPOSE 8100

# # Use `python -m uvicorn` so the interpreter (and its Prophet install) is the
# # one we control — avoids the classic "global uvicorn / venv prophet" mismatch.
# CMD ["sh", "-c", "python -m uvicorn app.main:app --host 0.0.0.0 --port ${BACKEND_PORT}"]
FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

# Only curl (for healthcheck). No build-essential — the statistical detector
# needs zero compilation. Enable Prophet later if you want it (see README).
RUN apt-get update && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --upgrade pip && pip install -r requirements.txt
COPY . .

ENV BACKEND_PORT=8100
EXPOSE 8100
CMD ["sh", "-c", "python -m uvicorn app.main:app --host 0.0.0.0 --port ${BACKEND_PORT}"]