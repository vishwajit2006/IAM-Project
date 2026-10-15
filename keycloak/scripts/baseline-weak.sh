#!/usr/bin/env bash
set -euo pipefail
# Classroom-only contrast baseline; intentionally weak settings for Practical 03/04.
# Never run against a real realm or production instance.
KCADM=/opt/keycloak/bin/kcadm.sh
$KCADM config credentials --server http://localhost:8080 --realm master --user "${KC_BOOTSTRAP_ADMIN_USERNAME:-admin}" --password "${KC_BOOTSTRAP_ADMIN_PASSWORD:?set bootstrap password}"
$KCADM update realms/ganpat-iam -s bruteForceProtected=false -s passwordPolicy='length(6)'
echo "WARNING: weak classroom baseline enabled. Run remediate.sh immediately after demonstration."
