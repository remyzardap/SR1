# PostgreSQL image with pgvector — owner runbook

`ops/postgres/Dockerfile` builds `postgres:16-alpine` plus pgvector (pinned `ARG PGVECTOR_VERSION`,
currently `v0.8.3`). `docker-compose.yml` uses it for the `postgres` service. This is the only place
the database image is built; the application never installs extensions by hand.

Everything below is an owner action on the machine that runs compose (the VPS). An agent never
rebuilds or restarts these containers. There is no host port mapping for `postgres` on purpose, so
every command goes through `docker compose exec`.

## Upgrade a running environment

1. **Back up first** — the image change touches a live volume.

   ```bash
   mkdir -p /root/backups
   docker compose exec -T postgres pg_dump -U sutaeru -d sutaeru -Fc \
     > /root/backups/sutaeru-pre-pgvector-$(date +%F).dump
   ls -l /root/backups/sutaeru-pre-pgvector-*.dump
   ```

   Confirm the file is non-empty before continuing (`pg_restore --list` on it needs a Postgres
   client; the size check is enough to catch a redirected error page). Keep this backup for **7
   days** — long enough to notice a retrieval or migration problem after the upgrade.

2. **Build the new image.**

   ```bash
   docker compose build postgres
   ```

3. **Recreate only the database.** The `postgres_data` volume is reused, so the existing schema and
   rows stay; the new image only adds the `vector` extension files.

   ```bash
   docker compose up -d postgres
   ```

4. **Confirm the extension is offered** (not yet installed — the app installs it):

   ```bash
   docker compose exec -T postgres psql -U sutaeru -d sutaeru -c \
     "SELECT name, default_version, installed_version FROM pg_available_extensions WHERE name = 'vector';"
   ```

   `default_version` should read `0.8.3`. If the row is missing, the wrong image is running — stop
   and check step 2/3 output before going on.

5. **Re-run the app migrations** so the optional schema is applied:

   ```bash
   docker compose restart sutaeru
   docker compose logs --tail=50 sutaeru | grep -i migrate
   ```

   Expect `Optional pgvector schema ensured (6 statements).` The server starts even if that line is
   a warning instead — see "If the extension is not available" below.

6. **Verify the result.**

   ```bash
   docker compose exec -T postgres psql -U sutaeru -d sutaeru -c "SELECT extname FROM pg_extension;"
   docker compose exec -T postgres psql -U sutaeru -d sutaeru -c \
     "SELECT indexname FROM pg_indexes WHERE indexname IN ('memories_embedding_hnsw','kc_embedding_hnsw');"
   ```

   `vector` is listed, and both hnsw indexes exist. `chat_messages.embedding_vec` is a `vector`
   column while `chat_messages.embedding` is still the old `jsonb` column — both are expected.

7. **Nothing else to do.** Backups stay in `/root/backups` for the 7-day window, then you can prune
   them.

## Managed databases (decision D4)

On a hosted Postgres, install the extension from the provider console / superuser session
(`CREATE EXTENSION vector;` — some providers call it `vector` in an allowlist, e.g. Supabase, Neon,
RDS via `rds_superuser`), then restart the app so `server/migrate.ts` applies
`drizzle/optional/pgvector.sql`. The application only *probes* for the extension
(`hasPgvector()` in `server/core/dbCapabilities.ts`); it never requires it, so a provider without
pgvector is a supported configuration, not a broken one.

## If the extension is not available

`server/migrate.ts` logs

```
[migrate] The vector extension is not available in this database ... drizzle/optional/pgvector.sql was skipped.
```

and continues. The journal (`drizzle/migrations/`) is untouched, the Phase 2 non-vector schema
(`0026_phase2_knowledge`) still applies, and retrieval keeps running on
`server/services/vectorSearch.ts`, which computes similarities in JavaScript from
`memories.structuredData.embedding`. No flag, no env var, no code change is needed to run without
pgvector; installing it later is just steps 2–6 again.

## Rollback

Two independent levels, cheapest first. Always stop the app before touching the schema so no
request writes to a column you are about to drop.

**A. Roll back the schema, keep the image** (e.g. the vector columns are causing trouble):

```bash
docker compose stop sutaeru
docker compose exec -T postgres psql -U sutaeru -d sutaeru -c "DROP EXTENSION IF EXISTS vector CASCADE;"
docker compose start sutaeru
```

`CASCADE` removes exactly what this work package added: `memories.embedding`,
`knowledge_chunks.embedding`, `chat_messages.embedding_vec` and the two hnsw indexes. It does not
touch the `jsonb` `chat_messages.embedding` column (no dependency on the extension), and it does not
roll back `0026_phase2_knowledge`, whose tables are vector-free — journal entries stay applied, as
they must.

**B. Roll back the image** (e.g. the build itself is bad). Do level A first, then revert the compose
change and recreate:

```bash
git checkout docker-compose.yml          # or the specific revert commit
docker compose up -d postgres
docker compose start sutaeru
docker compose logs --tail=50 sutaeru | grep -i migrate   # now the skip warning, exit status fine
```

**C. Volume damaged / data wrong** — restore the step 1 backup into a fresh volume:

```bash
docker compose stop sutaeru postgres
docker volume rename sutaeru_postgres_data sutaeru_postgres_data.broken-$(date +%F)
docker compose up -d postgres            # starts empty on the current image
docker compose exec -T postgres pg_restore -U sutaeru -d sutaeru --exit-on-error < /root/backups/sutaeru-pre-pgvector-<DATE>.dump
docker compose start sutaeru
```

Re-run step 6 afterwards, then check `http://127.0.0.1:5000/health`. Keep the `.broken` volume until
you are sure the restore is good.

## Bumping pgvector later

Change `ARG PGVECTOR_VERSION` (tags: <https://github.com/pgvector/pgvector/tags>), rebuild, and
repeat steps 1–6. An extension upgrade inside an existing volume needs
`ALTER EXTENSION vector UPDATE;` — Postgres runs that automatically for `CREATE EXTENSION IF NOT
EXISTS` only on a fresh install, so decide deliberately and note it in the commit message.
