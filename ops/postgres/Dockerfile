# PostgreSQL 16 (Alpine) + pgvector - the database image behind the compose "postgres" service.
#
# Stays on postgres:16-alpine on purpose: the existing postgres_data volume was initialised by this
# musl build, and moving it to a Debian (glibc) image can change collation ordering under existing
# indexes. pgvector is compiled in at build time, so the volume and the extension version travel
# together.
#
# Build:  docker compose build postgres   (runbook with backup and rollback: ops/postgres/README.md)
FROM postgres:16-alpine

# Pinned so a rebuild is reproducible and an upstream release cannot silently change vector
# operators. Bump deliberately: rebuild, then re-run the runbook.
ARG PGVECTOR_VERSION=v0.8.3

# clang and llvm are build-time only: pgvector's Makefile emits LLVM bitcode because the Postgres
# packages here were built --with-llvm. Postgres runs without JIT either way.
RUN apk add --no-cache --virtual .build git build-base clang llvm \
 && git clone --depth 1 --branch "${PGVECTOR_VERSION}" \
      https://github.com/pgvector/pgvector.git /tmp/pgvector \
 && cd /tmp/pgvector \
 && make \
 && make install \
 && rm -rf /tmp/pgvector \
 && apk del .build

# No schema work happens here. server/migrate.ts probes pg_available_extensions at startup and,
# when the extension is offered, applies drizzle/optional/pgvector.sql (CREATE EXTENSION plus the
# vector(1024) columns and hnsw indexes). Restart the app service after this image changes.
