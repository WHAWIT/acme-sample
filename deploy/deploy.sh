#!/usr/bin/env bash
# Build and deploy acme-orders to Cloud Run (GCP project: whawit)
set -euo pipefail

PROJECT=whawit
REGION=us-central1
IMAGE="us-central1-docker.pkg.dev/${PROJECT}/whawit/acme-orders:${1:-v1}"

gcloud builds submit --project "$PROJECT" --tag "$IMAGE" .

gcloud run deploy acme-orders \
  --project "$PROJECT" --region "$REGION" \
  --image "$IMAGE" \
  --allow-unauthenticated \
  --min-instances 1 --max-instances 1 \
  --no-cpu-throttling \
  --cpu 1 --memory 512Mi --port 8080 \
  --set-env-vars "ORDER_RATE_PER_MIN=5,QUERY_RATE_PER_MIN=30,BASELINE_NOISE=true,SERVICE_VERSION=1.4.2,NODE_ENV=production" \
  --set-secrets "ADMIN_TOKEN=acme-admin-token:latest"

echo "Deployed. Service URL:"
gcloud run services describe acme-orders --project "$PROJECT" --region "$REGION" --format="value(status.url)"
