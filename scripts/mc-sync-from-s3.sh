#!/bin/bash
set -euo pipefail
DEST="/opt/minecraft"
BUCKET="${S3_BUCKET}"
SERVER_PATH="servers/${SERVER_ID}"
ENDPOINT_OPT="${S3_ENDPOINT:+--endpoint-url '${S3_ENDPOINT}'}"
AWS_ACCESS_KEY_ID="${AWS_ACCESS_KEY_ID}"
AWS_SECRET_ACCESS_KEY="${AWS_SECRET_ACCESS_KEY}"
if [ "${NEEDS_FILE_DELETION}" = "true" ]; then
  echo "[mc-sync-from-s3] File deletion requested, skipping S3 sync."
  exit 0
fi
if [ -z "$BUCKET" ] || [ -z "$AWS_ACCESS_KEY_ID" ] || [ -z "$AWS_SECRET_ACCESS_KEY" ]; then
  echo "[mc-sync-from-s3] Missing S3 configuration, skipping sync."
  exit 0
fi
echo "[mc-sync-from-s3] Starting sync from s3://$BUCKET/$SERVER_PATH to $DEST ..."
sudo -u minecraft bash -lc "aws s3 sync \"s3://$BUCKET/$SERVER_PATH/\" \"$DEST\" $ENDPOINT_OPT --exact-timestamps --exclude 'node_modules/*'"
EXIT_CODE=$?
if [ $EXIT_CODE -eq 0 ]; then
  echo "[mc-sync-from-s3] Sync complete."
else
  echo "[mc-sync-from-s3] Sync failed with exit code $EXIT_CODE"
  exit $EXIT_CODE
fi