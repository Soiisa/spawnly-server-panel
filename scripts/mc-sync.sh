#!/bin/bash
set -euo pipefail
SRC="/opt/minecraft"
BUCKET="${S3_BUCKET}"
SERVER_PATH="servers/${SERVER_ID}"
ENDPOINT_OPT="${S3_ENDPOINT:+--endpoint-url '${S3_ENDPOINT}'}"
AWS_ACCESS_KEY_ID="${AWS_ACCESS_KEY_ID}"
AWS_SECRET_ACCESS_KEY="${AWS_SECRET_ACCESS_KEY}"
if [ -z "$BUCKET" ] || [ -z "$AWS_ACCESS_KEY_ID" ] || [ -z "$AWS_SECRET_ACCESS_KEY" ]; then
  echo "[mc-sync] Missing S3 configuration, skipping sync."
  exit 0
fi
echo "[mc-sync] Starting sync from $SRC to s3://$BUCKET/$SERVER_PATH ..."
sudo -u minecraft bash -lc "aws s3 sync \"$SRC\" \"s3://$BUCKET/$SERVER_PATH/\" $ENDPOINT_OPT --exact-timestamps --delete --exclude 'node_modules/*'"
EXIT_CODE=$?
if [ $EXIT_CODE -eq 0 ]; then
  echo "[mc-sync] Sync complete."
else
  echo "[mc-sync] Sync failed with exit code $EXIT_CODE"
  exit $EXIT_CODE
fi