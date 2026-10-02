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
    console.log(p.projectPath || "");
    for (const id of p.protectedOrgIds || []) console.log(id);
  ' "$PROJECT_FILE"
}
PROJECT_VALUES=()
while IFS= read -r line; do PROJECT_VALUES+=("$line"); done < <(read_project)
if [[ ${#PROJECT_VALUES[@]} -lt 5 ]]; then
  echo "ABORT: could not read ${PROJECT_FILE}." >&2
  exit 1
fi
SOURCE_ALIAS="${PROJECT_VALUES[0]}"
TARGET_ALIAS="${PROJECT_VALUES[1]}"
EXPECTED_SOURCE_ID="${PROJECT_VALUES[2]}"
EXPECTED_TARGET_ID="${PROJECT_VALUES[3]}"
PROJECT_PATH="${PROJECT_VALUES[4]}"

# A copied project folder may carry a migration.project.json from somewhere else: refuse it.
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd -P)"
if [[ -n "$PROJECT_PATH" && "$PROJECT_PATH" != "$PROJECT_ROOT" ]]; then
  echo "ABORT: migration.project.json was created in ${PROJECT_PATH}, this is ${PROJECT_ROOT}." >&2
  echo "Select source and target org again in Migration Studio." >&2
  exit 1
fi

# Known production org IDs. The target must never resolve to one of these.
PROD_ORG_IDS=()
if [[ ${#PROJECT_VALUES[@]} -gt 5 ]]; then PROD_ORG_IDS=("${PROJECT_VALUES[@]:5}"); fi

OBJECT_DIR_NAME="${1:-}"
if [[ -z "$OBJECT_DIR_NAME" || ! -f "${SCRIPT_DIR}/${OBJECT_DIR_NAME}/export.json" ]]; then
  echo "Usage: $0 <object-folder> [--live]" >&2
  echo "Available folders:" >&2
  (cd "$SCRIPT_DIR" && ls -d [0-9]*/ 2>/dev/null | sed 's#/$#   #;s#^#  #') >&2
  exit 1
fi
shift
RUN_DIR="${SCRIPT_DIR}/${OBJECT_DIR_NAME}"

# Options: --live (write to the target) and --export <file> (run with a generated export.json, for example
# limited to a cohort; the stored export.json of the folder stays untouched).
LIVE=0
EXPORT_FILE=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --live) LIVE=1; shift ;;
    --export)
      EXPORT_FILE="${2:-}"
      if [[ -z "$EXPORT_FILE" || ! -f "$EXPORT_FILE" ]]; then echo "ABORT: --export needs an existing file." >&2; exit 1; fi
      shift 2 ;;
    *) echo "Unknown option: $1" >&2; exit 1 ;;
  esac
done

# SFDMU reads ValueMapping.csv from the run folder. Each object folder owns its file (only its own rows,
# plus rows of parents pulled along); a missing file is created empty so objects without value mapping run too.
if [[ ! -f "${RUN_DIR}/ValueMapping.csv" ]]; then
  printf 'ObjectName,FieldName,RawValue,Value\n' > "${RUN_DIR}/ValueMapping.csv"
fi

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
if [[ "$LIVE" == "1" ]]; then
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

# With --export the run happens in a work folder with the generated export.json; the results are copied back
# into the object folder afterwards, so everything downstream (results, archive) works the same.
SFDMU_DIR="$RUN_DIR"
WORK_DIR=""
if [[ -n "$EXPORT_FILE" ]]; then
  WORK_DIR="${SCRIPT_DIR}/.work/${OBJECT_DIR_NAME}"
  mkdir -p "${WORK_DIR:?}"
  rm -rf "${WORK_DIR:?}/target" "${WORK_DIR:?}/reports"
  cp "$EXPORT_FILE" "${WORK_DIR}/export.json"
  cp "${RUN_DIR}/ValueMapping.csv" "${WORK_DIR}/ValueMapping.csv"
  SFDMU_DIR="$WORK_DIR"
  echo "Export: generated file ${EXPORT_FILE} (the stored export.json is not used)"
  echo ""
fi

set +e
sf sfdmu run \
  --sourceusername "$SOURCE_ALIAS" \
  --targetusername "$TARGET_ALIAS" \
  -p "$SFDMU_DIR" \
  --canmodify "$TARGET_DOMAIN" \
  --noprompt \
  "${MODE_ARGS[@]+"${MODE_ARGS[@]}"}"
STATUS=$?
set -e

if [[ -n "$WORK_DIR" ]]; then
  for sub in target reports; do
    rm -rf "${RUN_DIR:?}/${sub}"
    if [[ -d "${WORK_DIR}/${sub}" ]]; then
      mkdir -p "${RUN_DIR}/${sub}"
      cp -R "${WORK_DIR}/${sub}/." "${RUN_DIR}/${sub}/"
    fi
  done
fi
exit "$STATUS"
