#!/usr/bin/env bash

set -euo pipefail

MIGRATIONS_DIR="${1:-prisma/turso-migrations}"
DB_NAME="${TURSO_DATABASE_NAME:?TURSO_DATABASE_NAME is required}"
LEGACY_USER_MGMT_MIGRATION="20260305_add_user_management_and_team_join_requests.sql"

query_number() {
  local sql="$1"
  turso db shell "$DB_NAME" "$sql" | grep -Eo '[0-9]+' | tail -n1 || true
}

mark_applied() {
  local migration_id="$1"
  local migration_id_escaped="${migration_id//\'/\'\'}"
  turso db shell "$DB_NAME" "INSERT OR IGNORE INTO _authlab_schema_migrations (id) VALUES ('$migration_id_escaped');" >/dev/null
}

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

  already_applied="$(query_number "SELECT COUNT(1) FROM _authlab_schema_migrations WHERE id = '$migration_id_escaped';")"

  if [ "$already_applied" = "1" ]; then
    echo "Skipping already applied migration: $migration_id"
    continue
  fi

  # Baseline migrations should run only on an empty database.
  if [[ "$migration_id" == *_init.sql ]]; then
    existing_core_tables="$(query_number "SELECT COUNT(1) FROM sqlite_master WHERE type = 'table' AND name IN ('User','Team','TeamMember','InviteToken','SystemSetting','AppInstance','TeamJoinRequest');")"
    existing_core_tables="${existing_core_tables:-0}"
    if [ "$existing_core_tables" -gt 0 ]; then
      echo "Skipping baseline migration on non-empty database: $migration_id"
      mark_applied "$migration_id"
      continue
    fi
  fi

  # This legacy migration is superseded when these schema elements already exist.
  if [ "$migration_id" = "$LEGACY_USER_MGMT_MIGRATION" ]; then
    has_join_request_table="$(query_number "SELECT COUNT(1) FROM sqlite_master WHERE type = 'table' AND name = 'TeamJoinRequest';")"
    has_must_change_password="$(query_number "SELECT COUNT(1) FROM pragma_table_info('User') WHERE name = 'mustChangePassword';")"
    has_join_request_table="${has_join_request_table:-0}"
    has_must_change_password="${has_must_change_password:-0}"
    if [ "$has_join_request_table" -gt 0 ] && [ "$has_must_change_password" -gt 0 ]; then
      echo "Skipping superseded legacy migration: $migration_id"
      mark_applied "$migration_id"
      continue
    fi
  fi

  echo "Applying migration: $migration_id"
  turso db shell "$DB_NAME" < "$migration"
  mark_applied "$migration_id"
done

echo "Turso migration step complete."
