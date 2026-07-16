FROM python:3.12-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PGSSLROOTCERT=/app/certs/root.crt

RUN apt-get update \
    && apt-get install -y --no-install-recommends libpq-dev gcc curl ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir -p /app/certs \
    && curl -fsSL "https://st.timeweb.com/cloud-static/ca.crt" -o /app/certs/root.crt \
    && chmod 0600 /app/certs/root.crt

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY alembic.ini .
COPY alembic ./alembic
COPY app ./app
COPY docker-entrypoint.sh .
RUN chmod +x docker-entrypoint.sh

EXPOSE 8000

ENTRYPOINT ["./docker-entrypoint.sh"]
