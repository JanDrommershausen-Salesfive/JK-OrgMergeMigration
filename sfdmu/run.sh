#!/usr/bin/env bash
#
# Runs ONE SFDMU object folder of the configured migration (source -> target org).
# Source and target come from migration.project.json, never from the default org:
# this script refuses to run if an alias no longer points to the org pinned there,
# so a copy-paste mistake or a changed default org can't hit the wrong org.
#
# Usage:
#   ./run.sh 020_Contact          # simulation only (-m), no writes
#   ./run.sh 020_Contact --live   # actually writes to the target org
#   ./run.sh                      # lists available object folders

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Orgs come from migration.project.json (written by the org selection in Migration Studio):
# aliases, org IDs pinned at selection time and the protected (production) org IDs.
# If an alias is ever re-authenticated against a different org, the mismatch check below stops the run.
PROJECT_FILE="${SCRIPT_DIR}/../migration.project.json"
if [[ ! -f "$PROJECT_FILE" ]]; then
  echo "ABORT: ${PROJECT_FILE} not found. Select source and target org in Migration Studio first." >&2
  exit 1
fi

read_project() {
  node -e '
    const p = JSON.parse(require("fs").readFileSync(process.argv[1], "utf8"));
    const need = (v, n) => { if (!v) { console.error("migration.project.json: " + n + " fehlt"); process.exit(1); } return v; };
    console.log(need(p.source && p.source.alias, "source.alias"));
    console.log(need(p.target && p.target.alias, "target.alias"));
    console.log(need(p.source && p.source.orgId, "source.orgId"));
    console.log(need(p.target && p.target.orgId, "target.orgId"));
    for (const id of p.protectedOrgIds || []) console.log(id);
  ' "$PROJECT_FILE"
}
PROJECT_VALUES=()
while IFS= read -r line; do PROJECT_VALUES+=("$line"); done < <(read_project)
if [[ ${#PROJECT_VALUES[@]} -lt 4 ]]; then
  echo "ABORT: could not read ${PROJECT_FILE}." >&2
  exit 1
fi
SOURCE_ALIAS="${PROJECT_VALUES[0]}"
TARGET_ALIAS="${PROJECT_VALUES[1]}"
EXPECTED_SOURCE_ID="${PROJECT_VALUES[2]}"
EXPECTED_TARGET_ID="${PROJECT_VALUES[3]}"

# Known production org IDs. The target must never resolve to one of these.
PROD_ORG_IDS=()
if [[ ${#PROJECT_VALUES[@]} -gt 4 ]]; then PROD_ORG_IDS=("${PROJECT_VALUES[@]:4}"); fi

OBJECT_DIR_NAME="${1:-}"
if [[ -z "$OBJECT_DIR_NAME" || ! -f "${SCRIPT_DIR}/${OBJECT_DIR_NAME}/export.json" ]]; then
  echo "Usage: $0 <object-folder> [--live]" >&2
  echo "Available folders:" >&2
  (cd "$SCRIPT_DIR" && ls -d [0-9]*/ 2>/dev/null | sed 's#/$#   #;s#^#  #') >&2
  exit 1
fi
shift
RUN_DIR="${SCRIPT_DIR}/${OBJECT_DIR_NAME}"

# SFDMU only reads ValueMapping.csv from the run folder; keep one shared copy and sync it in (gitignored there).
cp "${SCRIPT_DIR}/ValueMapping.csv" "${RUN_DIR}/ValueMapping.csv"

resolve_org() {
  local alias="$1"
  sf org display --target-org "$alias" --json
}

echo "Resolving source org alias '${SOURCE_ALIAS}'..."
SOURCE_JSON="$(resolve_org "$SOURCE_ALIAS")"
SOURCE_ID="$(echo "$SOURCE_JSON" | node -e 'process.stdout.write(JSON.parse(require("fs").readFileSync(0)).result.id)')"

echo "Resolving target org alias '${TARGET_ALIAS}'..."
TARGET_JSON="$(resolve_org "$TARGET_ALIAS")"
TARGET_ID="$(echo "$TARGET_JSON" | node -e 'process.stdout.write(JSON.parse(require("fs").readFileSync(0)).result.id)')"
TARGET_INSTANCE_URL="$(echo "$TARGET_JSON" | node -e 'process.stdout.write(JSON.parse(require("fs").readFileSync(0)).result.instanceUrl)')"

if [[ "$SOURCE_ID" != "$EXPECTED_SOURCE_ID"* ]]; then
  echo "ABORT: alias '${SOURCE_ALIAS}' resolved to org ID ${SOURCE_ID}, expected ${EXPECTED_SOURCE_ID}." >&2
  echo "The source alias has been re-authenticated against a different org. Update EXPECTED_SOURCE_ID after verifying this is intentional." >&2
  exit 1
fi

if [[ "$TARGET_ID" != "$EXPECTED_TARGET_ID"* ]]; then
  echo "ABORT: alias '${TARGET_ALIAS}' resolved to org ID ${TARGET_ID}, expected ${EXPECTED_TARGET_ID}." >&2
  echo "The target alias has been re-authenticated against a different org. Update EXPECTED_TARGET_ID after verifying this is intentional." >&2
  exit 1
fi

for prod_id in ${PROD_ORG_IDS[@]+"${PROD_ORG_IDS[@]}"}; do
  if [[ "$TARGET_ID" == "$prod_id"* ]]; then
    echo "ABORT: target org ID ${TARGET_ID} matches a known production org. Refusing to write." >&2
    exit 1
  fi
done

TARGET_DOMAIN="${TARGET_INSTANCE_URL#https://}"
TARGET_DOMAIN="${TARGET_DOMAIN%/}"

MODE_ARGS=("-m")
MODE_LABEL="simulation"
if [[ "${1:-}" == "--live" ]]; then
  MODE_ARGS=()
  MODE_LABEL="live"
  echo ""
  echo "LIVE RUN — this will write to ${TARGET_ALIAS} (${TARGET_DOMAIN})."
  read -r -p "Type the target alias '${TARGET_ALIAS}' to confirm: " CONFIRM
  if [[ "$CONFIRM" != "$TARGET_ALIAS" ]]; then
    echo "Confirmation did not match. Aborting." >&2
    exit 1
  fi
fi

echo ""
echo "Source: ${SOURCE_ALIAS} (${SOURCE_ID})"
echo "Target: ${TARGET_ALIAS} (${TARGET_ID}, ${TARGET_DOMAIN})"
echo "Object: ${OBJECT_DIR_NAME}"
echo "Mode:   ${MODE_LABEL}"
echo ""

sf sfdmu run \
  --sourceusername "$SOURCE_ALIAS" \
  --targetusername "$TARGET_ALIAS" \
  -p "$RUN_DIR" \
  --canmodify "$TARGET_DOMAIN" \
  --noprompt \
  "${MODE_ARGS[@]+"${MODE_ARGS[@]}"}"
