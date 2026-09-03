#!/usr/bin/env bash
# Build and deploy acme-orders to Cloud Run (GCP project: whawit)
set -euo pipefail

PROJECT=whawit
REGION=us-central1
IMAGE="us-central1-docker.pkg.dev/${PROJECT}/whawit/acme-orders:${1:-v1}"
VERSION="${SERVICE_VERSION:-1.4.3}"
# The commit Whawit's code tools will open: the mirror repo WHAWIT/acme-sample, so pass it
# explicitly when deploying from a monorepo checkout whose SHAs differ.
COMMIT_SHA="${COMMIT_SHA:-$(git rev-parse HEAD 2>/dev/null || echo unknown)}"

gcloud builds submit --project "$PROJECT" --tag "$IMAGE" .

gcloud run deploy acme-orders \
  --project "$PROJECT" --region "$REGION" \
  --image "$IMAGE" \
  --allow-unauthenticated \
  --min-instances 1 --max-instances 1 \
  --no-cpu-throttling \
  --cpu 1 --memory 512Mi --port 8080 \
  --set-env-vars "ORDER_RATE_PER_MIN=8,QUERY_RATE_PER_MIN=6,BASELINE_NOISE=true,SERVICE_VERSION=${VERSION},COMMIT_SHA=${COMMIT_SHA},ENVIRONMENT=production,REGION=${REGION},GCP_PROJECT=${PROJECT},NODE_ENV=production" \
  --set-secrets "ADMIN_TOKEN=acme-admin-token:latest,CHANGE_WEBHOOK_URL=acme-change-webhook-url:latest"

echo "Deployed. Service URL:"
gcloud run services describe acme-orders --project "$PROJECT" --region "$REGION" --format="value(status.url)"
