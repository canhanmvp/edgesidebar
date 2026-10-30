#!/usr/bin/env bash
set -euo pipefail
cd /home/runner
if [ ! -f .runner ]; then
  : "${REPO_URL:?Set REPO_URL in ci/runner/.env}"
  : "${RUNNER_TOKEN:?Set RUNNER_TOKEN in ci/runner/.env (valid for one hour)}"
  ./config.sh --unattended --replace \
    --url "$REPO_URL" \
    --token "$RUNNER_TOKEN" \
    --name "${RUNNER_NAME:-edgesidebar-docker}" \
    --labels edgesidebar \
    --work _work
fi
exec ./run.sh
