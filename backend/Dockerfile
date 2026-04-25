FROM python:3.12-slim

# libatomic1 is required by the Node binary that the prisma CLI downloads at
# `prisma generate` time (especially on arm64). Without it the node binary
# fails with: `error while loading shared libraries: libatomic.so.1`.
RUN apt-get update \
 && apt-get install -y --no-install-recommends libatomic1 \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN prisma generate --schema /app/schema.prisma

EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
