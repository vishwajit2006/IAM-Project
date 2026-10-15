#!/usr/bin/env bash
set -euo pipefail
KCADM=/opt/keycloak/bin/kcadm.sh
REALM=ganpat-iam
CLIENT=iam-governance-service
SECRET="${IAM_SERVICE_CLIENT_SECRET:?set IAM_SERVICE_CLIENT_SECRET}"
"$KCADM" config credentials --server http://keycloak:8080 --realm master --user "${KC_BOOTSTRAP_ADMIN_USERNAME:-admin}" --password "${KC_BOOTSTRAP_ADMIN_PASSWORD:?set bootstrap password}"
CLIENT_UUID="$("$KCADM" get clients -r "$REALM" -q "clientId=$CLIENT" --fields id,clientId | sed -n 's/.*"id"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -n1)"
if [[ -z "$CLIENT_UUID" ]]; then
  "$KCADM" create clients -r "$REALM" -s "clientId=$CLIENT" -s enabled=true -s publicClient=false -s serviceAccountsEnabled=true -s standardFlowEnabled=false -s directAccessGrantsEnabled=false -s clientAuthenticatorType=client-secret -s "secret=$SECRET"
  CLIENT_UUID="$("$KCADM" get clients -r "$REALM" -q "clientId=$CLIENT" --fields id,clientId | sed -n 's/.*"id"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -n1)"
else
  "$KCADM" update "clients/$CLIENT_UUID" -r "$REALM" -s enabled=true -s publicClient=false -s serviceAccountsEnabled=true -s standardFlowEnabled=false -s directAccessGrantsEnabled=false -s clientAuthenticatorType=client-secret -s "secret=$SECRET"
fi
if [[ -z "$CLIENT_UUID" ]]; then echo "Could not resolve service client UUID" >&2; exit 1; fi
# Assign only the API capabilities needed for user directory and native event reads.
for ROLE in query-users view-users manage-users view-events view-realm manage-realm; do
  "$KCADM" add-roles -r "$REALM" --uusername "service-account-$CLIENT" --cclientid realm-management --rolename "$ROLE"
done
"$KCADM" update events/config -r "$REALM" -s eventsEnabled=true -s adminEventsEnabled=true -s adminEventsDetailsEnabled=true -s 'eventsListeners=["jboss-logging"]'
echo "Keycloak idempotent setup complete (service account and event configuration)."
