FROM python:3.11-slim

RUN addgroup --system appgroup && adduser --system --ingroup appgroup appuser

WORKDIR /app

COPY requirements.txt ./
RUN pip install --no-cache-dir --upgrade pip \
 && pip install --no-cache-dir -r requirements.txt

COPY main.py __init__.py ./
COPY routers/      routers/
COPY services/     services/
COPY models/       models/
COPY db/           db/
COPY dependencies/ dependencies/
COPY data/         data/
COPY assets/       assets/
COPY scripts/docker-entrypoint.sh ./scripts/docker-entrypoint.sh

RUN chmod +x /app/scripts/docker-entrypoint.sh

USER appuser

EXPOSE 9000

ENV PORT=9000 \
    WEB_CONCURRENCY=2 \
    DEV_RELOAD=false \
    SERVE_FRONTEND=false

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:9000/api/health')" || exit 1

ENTRYPOINT ["/app/scripts/docker-entrypoint.sh"]
