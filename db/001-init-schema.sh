#!/bin/sh
set -eu
export PGPASSWORD="$POSTGRES_PASSWORD"
psql -v ON_ERROR_STOP=1 --username portal --dbname portal -f /db-init.sql
