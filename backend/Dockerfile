FROM python:3.12-slim

WORKDIR /app

# Dépendances système pour WeasyPrint + paramiko
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libgdk-pixbuf-xlib-2.0-0 \
    libffi-dev \
    libcairo2 \
    libpq-dev \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY pyproject.toml .
RUN pip install --no-cache-dir --upgrade pip setuptools && \
    pip install --no-cache-dir "bcrypt==4.0.1" && \
    pip install --no-cache-dir .

COPY . .

RUN mkdir -p /app/storage/pdf /app/storage/photos /app/storage/ftp_archive

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
