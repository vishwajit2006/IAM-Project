#!/bin/sh
set -eu
# Password is supplied at runtime through POSTGRES_PASSWORD; no credentials are committed here.
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres \
  -v app_password="$POSTGRES_PASSWORD" <<'SQL'
CREATE USER keycloak WITH ENCRYPTED PASSWORD :'app_password';
CREATE DATABASE keycloak OWNER keycloak;
CREATE USER portal WITH ENCRYPTED PASSWORD :'app_password';
CREATE DATABASE portal OWNER portal;
SQL
