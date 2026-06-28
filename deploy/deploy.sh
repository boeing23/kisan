#!/usr/bin/env bash
# Kisan Alert — deploy the gateway to Cloud Run + wire the dry-spell scheduler.
# Prereqs: gcloud authenticated, billing on, APIs enabled (see README).
set -euo pipefail

PROJECT="${PROJECT:-kisan-alert-500812}"
REGION="${REGION:-asia-south1}"
SERVICE="kisan-gateway"
SA="kisan-backend@${PROJECT}.iam.gserviceaccount.com"

echo "==> Building & deploying gateway to Cloud Run"
gcloud run deploy "$SERVICE" \
  --source . \
  --project "$PROJECT" \
  --region "$REGION" \
  --service-account "$SA" \
  --set-env-vars "GCP_PROJECT_ID=${PROJECT},FIRESTORE_DATABASE_ID=kisan-db" \
  --set-secrets "GEMINI_API_KEY=gemini-api-key:latest" \
  --allow-unauthenticated \
  --memory 512Mi

URL=$(gcloud run services describe "$SERVICE" --project "$PROJECT" --region "$REGION" --format 'value(status.url)')
echo "==> Gateway URL: $URL"

echo "==> Creating daily dry-spell Cloud Scheduler job (06:00 IST)"
gcloud scheduler jobs create http kisan-dry-spell \
  --project "$PROJECT" \
  --location "$REGION" \
  --schedule "0 6 * * *" \
  --time-zone "Asia/Kolkata" \
  --uri "${URL}/jobs/dry-spell" \
  --http-method POST \
  --oidc-service-account-email "$SA" \
  || echo "(scheduler job may already exist — update with 'gcloud scheduler jobs update http kisan-dry-spell ...')"

echo "==> Done. Deploy dashboard with: firebase deploy --only hosting,firestore:rules"
