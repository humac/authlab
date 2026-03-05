#!/usr/bin/env bash

set -euo pipefail

MIGRATIONS_DIR="${1:-prisma/turso-migrations}"
DB_NAME="${TURSO_DATABASE_NAME:?TURSO_DATABASE_NAME is required}"

if [ ! -d "$MIGRATIONS_DIR" ]; then
  echo "No migrations directory found at $MIGRATIONS_DIR; skipping Turso migration step."
  exit 0
fi

shopt -s nullglob
MIGRATIONS=("$MIGRATIONS_DIR"/*.sql)

if [ "${#MIGRATIONS[@]}" -eq 0 ]; then
  echo "No .sql migration files found in $MIGRATIONS_DIR; skipping Turso migration step."
  exit 0
fi

echo "Ensuring migration tracking table exists..."
turso db shell "$DB_NAME" "CREATE TABLE IF NOT EXISTS _authlab_schema_migrations (id TEXT PRIMARY KEY, applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP);"

for migration in "${MIGRATIONS[@]}"; do
  migration_id="$(basename "$migration")"
  migration_id_escaped="${migration_id//\'/\'\'}"

  already_applied="$(
    turso db shell "$DB_NAME" "SELECT COUNT(1) FROM _authlab_schema_migrations WHERE id = '$migration_id_escaped';" \
      | grep -Eo '[0-9]+' \
      | tail -n1 || true
  )"

  if [ "$already_applied" = "1" ]; then
    echo "Skipping already applied migration: $migration_id"
    continue
  fi

  echo "Applying migration: $migration_id"
  turso db shell "$DB_NAME" < "$migration"
  turso db shell "$DB_NAME" "INSERT INTO _authlab_schema_migrations (id) VALUES ('$migration_id_escaped');"
done

echo "Turso migration step complete."
