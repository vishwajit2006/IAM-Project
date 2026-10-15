#!/usr/bin/env bash
set -euo pipefail
KCADM=/opt/keycloak/bin/kcadm.sh
$KCADM config credentials --server http://localhost:8080 --realm master --user "${KC_BOOTSTRAP_ADMIN_USERNAME:-admin}" --password "${KC_BOOTSTRAP_ADMIN_PASSWORD:?set bootstrap password}"
$KCADM update realms/ganpat-iam -s bruteForceProtected=true -s failureFactor=5 -s waitIncrementSeconds=60 -s maxFailureWaitSeconds=900 -s passwordPolicy='length(12) and digits(1) and upperCase(1) and lowerCase(1) and specialChars(1)'
$KCADM update events/config -r ganpat-iam -s eventsEnabled=true -s adminEventsEnabled=true -s adminEventsDetailsEnabled=true -s 'eventsListeners=["jboss-logging"]'
echo "Security baseline restored."
