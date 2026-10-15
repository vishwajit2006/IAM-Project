#!/usr/bin/env bash
# keycloak/scripts/mfa-flow.sh
# Role-based MFA: password for everyone, OTP only for users who hold (directly or via composite) the
# realm role "mfa-required". Idempotent: deletes and recreates its own flow on every run.
# Uses only bash + kcadm (the Keycloak image has no awk/jq guaranteed).
#
# Run on the live stack:
#   docker compose cp keycloak/scripts/mfa-flow.sh keycloak:/tmp/mfa-flow.sh
#   docker compose exec keycloak bash /tmp/mfa-flow.sh
# Optional env: KC_ADMIN_USER, KC_ADMIN_PASSWORD, KC_SERVER, REALM, MFA_ROLE
set -euo pipefail

KCADM="${KCADM:-/opt/keycloak/bin/kcadm.sh}"
SERVER="${KC_SERVER:-http://localhost:8080}"
REALM="${REALM:-ganpat-iam}"
MFA_ROLE="${MFA_ROLE:-mfa-required}"
ADMIN_USER="${KC_ADMIN_USER:-${KC_BOOTSTRAP_ADMIN_USERNAME:-admin}}"
ADMIN_PASS="${KC_ADMIN_PASSWORD:-${KC_BOOTSTRAP_ADMIN_PASSWORD:-}}"

FLOW="browser-mfa-by-role"
FORMS="mfa-forms"
PRIV="mfa-privileged"

[ -n "$ADMIN_PASS" ] || { echo "ERROR: set KC_ADMIN_PASSWORD (no bootstrap password found in env)"; exit 1; }

echo "== Login to $SERVER =="
"$KCADM" config credentials --server "$SERVER" --realm master --user "$ADMIN_USER" --password "$ADMIN_PASS"

echo "== Check role '$MFA_ROLE' exists =="
"$KCADM" get "roles/$MFA_ROLE" -r "$REALM" --fields name >/dev/null \
  || { echo "ERROR: realm role '$MFA_ROLE' not found in realm '$REALM'"; exit 1; }

# ---- pure-bash helpers (parallel lists paired by index) ----
flow_id() { # alias -> id (empty if none)
  local ids aliases i
  mapfile -t ids < <("$KCADM" get authentication/flows -r "$REALM" --fields id --format csv --noquotes)
  mapfile -t aliases < <("$KCADM" get authentication/flows -r "$REALM" --fields alias --format csv --noquotes)
  for i in "${!aliases[@]}"; do
    if [[ "${aliases[$i]}" == "$1" ]]; then echo "${ids[$i]}"; return 0; fi
  done
  return 0
}
exec_id() { # parent flow alias, execution display name -> execution id
  local ids names i
  mapfile -t ids < <("$KCADM" get "authentication/flows/$1/executions" -r "$REALM" --fields id --format csv --noquotes)
  mapfile -t names < <("$KCADM" get "authentication/flows/$1/executions" -r "$REALM" --fields displayName --format csv --noquotes)
  for i in "${!names[@]}"; do
    if [[ "${names[$i]}" == "$2" ]]; then echo "${ids[$i]}"; return 0; fi
  done
  echo "ERROR: execution '$2' not found in flow '$1'" >&2
  return 1
}
set_req() { # parent alias, display name, requirement
  local id; id="$(exec_id "$1" "$2")"
  "$KCADM" update "authentication/flows/$1/executions" -r "$REALM" -b "{\"id\":\"$id\",\"requirement\":\"$3\"}"
}

echo "== OTP policy + required action =="
"$KCADM" update "realms/$REALM" \
  -s otpPolicyType=totp -s otpPolicyAlgorithm=HmacSHA1 -s otpPolicyDigits=6 \
  -s otpPolicyPeriod=30 -s otpPolicyLookAheadWindow=1
"$KCADM" update authentication/required-actions/CONFIGURE_TOTP -r "$REALM" -s enabled=true -s defaultAction=false

echo "== Unbind and remove any previous version of this flow =="
"$KCADM" update "realms/$REALM" -s browserFlow=browser
for a in "$FLOW" "$FORMS" "$PRIV"; do
  id="$(flow_id "$a")"
  if [[ -n "$id" ]]; then "$KCADM" delete "authentication/flows/$a" -r "$REALM"; fi
done

echo "== Build flow structure =="
"$KCADM" create authentication/flows -r "$REALM" \
  -s alias="$FLOW" -s providerId=basic-flow -s topLevel=true -s builtIn=false \
  -s description="Password for all; OTP for users holding $MFA_ROLE"
"$KCADM" create "authentication/flows/$FLOW/executions/execution" -r "$REALM" -s provider=auth-cookie
"$KCADM" create "authentication/flows/$FLOW/executions/execution" -r "$REALM" -s provider=identity-provider-redirector
"$KCADM" create "authentication/flows/$FLOW/executions/flow" -r "$REALM" \
  -s alias="$FORMS" -s type=basic-flow -s description="Username/password plus conditional OTP"
"$KCADM" create "authentication/flows/$FORMS/executions/execution" -r "$REALM" -s provider=auth-username-password-form
"$KCADM" create "authentication/flows/$FORMS/executions/flow" -r "$REALM" \
  -s alias="$PRIV" -s type=basic-flow -s description="OTP only for $MFA_ROLE holders"
"$KCADM" create "authentication/flows/$PRIV/executions/execution" -r "$REALM" -s provider=conditional-user-role
"$KCADM" create "authentication/flows/$PRIV/executions/execution" -r "$REALM" -s provider=auth-otp-form

echo "== Requirements =="
set_req "$FLOW" "Cookie" ALTERNATIVE
set_req "$FLOW" "Identity Provider Redirector" ALTERNATIVE
set_req "$FLOW" "$FORMS" ALTERNATIVE
set_req "$FORMS" "Username Password Form" REQUIRED
set_req "$FORMS" "$PRIV" CONDITIONAL
set_req "$PRIV" "Condition - user role" REQUIRED
set_req "$PRIV" "OTP Form" REQUIRED

echo "== Condition config: role = $MFA_ROLE =="
COND_ID="$(exec_id "$PRIV" "Condition - user role")"
"$KCADM" create "authentication/executions/$COND_ID/config" -r "$REALM" \
  -b "{\"alias\":\"mfa-role-condition\",\"config\":{\"condUserRole\":\"$MFA_ROLE\",\"negate\":\"false\"}}"

echo "== Bind as realm browser flow =="
"$KCADM" update "realms/$REALM" -s browserFlow="$FLOW"

echo
echo "== RESULT: realm browserFlow =="
"$KCADM" get "realms/$REALM" --fields browserFlow
for a in "$FLOW" "$FORMS" "$PRIV"; do
  echo "-- $a --"
  "$KCADM" get "authentication/flows/$a/executions" -r "$REALM" --fields displayName,requirement --format csv --noquotes
done
echo "Done. Test: stu.ict1 -> no OTP prompt; leader.ict -> authenticator enrollment."
