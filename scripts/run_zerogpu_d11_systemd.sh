#!/usr/bin/env bash
# Run the bounded d1.1 comparison through the already-provisioned
# systemd user environment. No keys are exported, read or logged by this script.
set -euo pipefail
if ! command -v systemd-run >/dev/null 2>&1; then
  echo "systemd-run unavailable: no requests made" >&2
  exit 3
fi
if [[ "${1:-1}" =~ ^([1-9]|1[0-2])$ ]]; then
  limit="${1:-1}"
else
  echo "Usage: scripts/run_zerogpu_d11_systemd.sh [1..12]" >&2
  exit 2
fi
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# One dry-run is the default; use 12 only after a confirmed authorized response.
exec systemd-run --user --wait --pipe --collect --working-directory="$root" \
  /usr/bin/python3 -B scripts/compare_zerogpu_d11_student.py --live --limit "$limit" --timeout 12
