# ACME Orders — Demo Runbook

Internal cheatsheet for driving the demo. **Do not share with prospects.**

## Service

- Cloud Run: `acme-orders`, GCP project `whawit`, us-central1.
- Baseline: ~5 orders/min (~7,200/day), ~30 storefront queries/min, baseline noise on.
- Logs: stdout JSON → Cloud Logging (`resource.labels.service_name="acme-orders"`).

## Admin API

All calls need the header `x-acme-admin-token: $ADMIN_TOKEN` (Secret Manager: `acme-admin-token`).

```bash
BASE=https://acme-orders-365856618342.us-central1.run.app   # or custom URL
TOKEN=<admin token>

# Status & scenario list
curl -s -H "x-acme-admin-token: $TOKEN" $BASE/admin/status | jq
curl -s -H "x-acme-admin-token: $TOKEN" $BASE/admin/scenarios | jq

# Start / stop a scenario
curl -s -X POST -H "x-acme-admin-token: $TOKEN" -H 'content-type: application/json' \
  -d '{"durationMinutes":10,"intensity":"medium"}' \
  $BASE/admin/scenarios/payment-gateway-outage/start | jq
curl -s -X POST -H "x-acme-admin-token: $TOKEN" $BASE/admin/scenarios/payment-gateway-outage/stop

# PANIC BUTTON — stop everything
curl -s -X POST -H "x-acme-admin-token: $TOKEN" $BASE/admin/scenarios/stop-all

# Tune rates (denser charts before a demo)
curl -s -X POST -H "x-acme-admin-token: $TOKEN" -H 'content-type: application/json' \
  -d '{"orderRatePerMin":20}' $BASE/admin/config
```

## Scenarios

| Scenario | Duration | What it produces | Monitor it trips |
|---|---|---|---|
| `payment-gateway-outage` | 10m | 502s + ETIMEDOUT from payment-gateway, circuit breaker OPEN (CRITICAL) | "payment failures / gateway errors" |
| `bad-deploy-npe` | 20m | `deployment_completed v1.5.0` then TypeError bursts from discount.service (stack traces) | "errors after deploy / pricing failures" |
| `db-pool-exhaustion` | 15m | ERR_POOL_TIMEOUT, 500s on query endpoints | "database pool / 500s" |
| `memory-leak-degradation` | 30m | heap climbing in metrics_snapshot, cache_degraded WARNs; high intensity = real OOM | "memory pressure" |
| `inventory-desync` | 15m | ERR_OVERSELL + fulfillment shortfalls | "inventory / oversell" |
| `checkout-latency-spike` | 10m | slow availability checks, 504s on /api/checkout/quote | "latency / timeouts" |
| `duplicate-order-storm` | 10m | ERR_DUPLICATE_ORDER reconciliation errors | "duplicate orders" |
| `payment-mismatch-spike` | 10m | ERR_AMOUNT_MISMATCH capture failures | "payment mismatches" |

## Planted bugs (fix-demo targets)

| Bug | File | Trigger scenario |
|---|---|---|
| Promo NPE (no guard on `rules`) | `src/pricing/discount.service.ts` | `bad-deploy-npe` |
| Float tax drift | `src/pricing/tax.calculator.ts` | `payment-mismatch-spike` (chronic 0.5%) |
| Idempotency race | `src/orders/idempotency.store.ts` | `duplicate-order-storm` |
| Pool leak on empty result | `src/infra/db-pool.ts` | `db-pool-exhaustion` |
| Cache key timestamp bucket | `src/cache/product-cache.ts` | `memory-leak-degradation` |
| Cutoff parsed as UTC | `src/shipping/delivery-estimator.ts` | chronic, 22:00–02:00 UTC |

## Demo-day timeline (see full plan)

- T-48h…T-24h: bake baseline + run `bad-deploy-npe`, `db-pool-exhaustion` ×2, `memory-leak` low; full dress rehearsal of `payment-gateway-outage`; resolve all rehearsal incidents in Whawit.
- T-90min: run `bad-deploy-npe` (pre-staged incident for the IDE fix act).
- Minute 7 of the demo: `payment-gateway-outage/start` (expect Slack ping in 6–11 min).
- After demo: `stop-all`, resolve incidents in Whawit.
