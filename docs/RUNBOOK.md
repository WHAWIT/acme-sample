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
| `checkout-missing-field` | 20m | `deployment_completed acme-mobile-app 2.3.0` then ERR_MISSING_SHIPPING_ZIP on `channel=mobile appVersion=2.3.0` | "checkout rejections after mobile deploy" |
| `insufficient-funds-wave` | 15m | `payment_declined reason=insufficient_funds` concentrated on `cardBin=451788/NorthBank` | "declines by card BIN / issuer" |
| `expired-promo-flood` | 15m | `cdn_cache_stale` then ERR_PROMO_EXPIRED / `promo_rejected` for `SUMMER24` on `channel=web` | "expired promo / pricing rejections" |
| `inventory-oversell` | 15m | ERR_OVERSELL + `order_backordered` on hot SKUs (`ELC-MON-20`, `CFE-GRD-20`) | "inventory / oversell" |
| `blocked-customer-retry-storm` | 10m | ERR_CUSTOMER_BLOCKED storm from one `customerId` (`cus_blk4h2q`) | "repeated blocked-customer rejections" |
| `stuck-orders-webhook` | 15m | `order_stuck_pending` / ERR_PAYMENT_CONFIRMATION_TIMEOUT for orders held in FULFILLING | "stuck / un-confirmed orders" |

## Correlation dimensions

Every order now carries four correlation dimensions, propagated onto
`order_state_changed` (the backbone) and the relevant failure logs
(`order_rejected`, `payment_declined`, `fraud_hold`, `order_backordered`,
`order_stuck_pending`):

- `channel` — `web` (~55%), `mobile` (~35%), `api` (~10%)
- `appVersion` — per channel (mobile rides `2.2.x`, web `4.10.2`, api `partner-api-1.8.0`)
- `cardBin` / `issuer` — fictional BIN table (BancoSol, NorthBank, Cardex, Meridian Credit, Vanguard Charge)

These are the raw material for correlation: the scenarios below skew one
dimension so Whawit can discover "all failures share `appVersion=2.3.0`" or
"all declines share `cardBin=451788`".

## Always-on functional drip (baseline)

Beyond the pre-existing drip (payment declined 4%, credit-limit 7% B2B, fraud
1.5%, no-carrier 0.5%, bad SKU 0.8%), two new checks run continuously:

- **Missing shipping zip** (`ERR_MISSING_SHIPPING_ZIP`) — generator emits ~0.3%
  of orders without a postal code → rejected in `validateStep`.
- **Blocked customer** (`ERR_CUSTOMER_BLOCKED`) — ~0.1% of orders come from a
  chargeback-blocked account (`src/domain/customer-blacklist.ts`) → rejected.

A **stuck-order sweeper** (`src/orders/stuck-order.sweeper.ts`) runs every 60s
and re-reports orders parked in a post-authorization state >120s
(`order_stuck_pending`, max 3× per order, growing age). Tunable via env:
`STUCK_ORDER_SWEEP_MS`, `STUCK_ORDER_AGE_MS`, `STUCK_CAPTURE_RETRY_MS`.

## Correlation scenarios (Part A)

Each scenario keeps the domain checks constant and only changes the *frequency*
of the inputs (the generator skews DTOs; the sims adjust rates). `intensity`
scales the input rate via the engine factor (low=1, medium=2, high=4).

### `checkout-missing-field`

- **Activates:** `onStart` logs `deployment_completed {service: acme-mobile-app, version: 2.3.0}`. While active, the generator emits `channel=mobile appVersion=2.3.0` orders **without a zip** at `8%×factor`. `onStop` logs the rollforward `deployment_completed 2.3.1`.
- **Logs:** `order_rejected errorCode=ERR_MISSING_SHIPPING_ZIP {orderId, customerId, channel, appVersion}` → REJECTED.
- **Demo (what Whawit should find):** a spike of checkout rejections that all share `channel=mobile` + `appVersion=2.3.0`, starting right after the mobile app deploy → points at the 2.3.0 build.

```bash
curl -s -X POST -H "x-acme-admin-token: $TOKEN" -H 'content-type: application/json' \
  -d '{"durationMinutes":20,"intensity":"high"}' $BASE/admin/scenarios/checkout-missing-field/start | jq
curl -s -X POST -H "x-acme-admin-token: $TOKEN" $BASE/admin/scenarios/checkout-missing-field/stop
```

### `insufficient-funds-wave`

- **Activates:** generator concentrates `cardBin=451788 issuer=NorthBank` on ~`40%×factor` of orders; the gateway sim declines 60% of authorizations **for that BIN only** with `reason=insufficient_funds`.
- **Logs:** `payment_declined {reason: insufficient_funds, cardBin, issuer, errorCode: ERR_PAYMENT_DECLINED}`.
- **Demo:** a decline spike where every declined order shares `cardBin=451788 / NorthBank` while other issuers stay healthy → an issuer-side incident, not our bug.

```bash
curl -s -X POST -H "x-acme-admin-token: $TOKEN" -H 'content-type: application/json' \
  -d '{"durationMinutes":15,"intensity":"high"}' $BASE/admin/scenarios/insufficient-funds-wave/start | jq
curl -s -X POST -H "x-acme-admin-token: $TOKEN" $BASE/admin/scenarios/insufficient-funds-wave/stop
```

### `expired-promo-flood`

- **Activates:** `onStart` logs `cdn_cache_stale {asset: landing/promo-banner, cachedVersion: summer-sale}`. Generator sends the expired `SUMMER24` promo on ~`25%×factor` of `channel=web` orders. (Note: `SUMMER24` is used deliberately rather than `SUMMER25` — `SUMMER25` is the trigger for `bad-deploy-npe`'s pricing NPE and is not expired, so reusing it would collide. `SUMMER24` is an already-expired promo *with* discount rules, so it trips the expiry check cleanly.)
- **Logs:** `promo_rejected errorCode=ERR_PROMO_EXPIRED {promoCode: SUMMER24}` then the order reprices without the promo.
- **Demo:** a flood of expired-promo rejections on `channel=web` correlated with a stale-CDN event → a marketing/CDN cache problem.

```bash
curl -s -X POST -H "x-acme-admin-token: $TOKEN" -H 'content-type: application/json' \
  -d '{"durationMinutes":15,"intensity":"high"}' $BASE/admin/scenarios/expired-promo-flood/start | jq
curl -s -X POST -H "x-acme-admin-token: $TOKEN" $BASE/admin/scenarios/expired-promo-flood/stop
```

### `inventory-oversell`

- **Activates:** generator concentrates ~`60%×factor` of orders onto two hot SKUs (`ELC-MON-20`, `CFE-GRD-20`) at inflated quantities; the inventory sim holds those SKUs' true stock below the reservation ledger while serving inflated availability to the allocation gate.
- **Logs:** `oversell_detected errorCode=ERR_OVERSELL` + `fulfillment_shortfall`, plus `order_backordered errorCode=ERR_INSUFFICIENT_STOCK`, all on the hot SKUs. Stock is replenished (`stock_replenished`) on stop.
- **Demo:** oversells and backorders concentrated on a tiny set of SKUs during a flash sale → an inventory/reservation desync on those SKUs.

```bash
curl -s -X POST -H "x-acme-admin-token: $TOKEN" -H 'content-type: application/json' \
  -d '{"durationMinutes":15,"intensity":"high"}' $BASE/admin/scenarios/inventory-oversell/start | jq
curl -s -X POST -H "x-acme-admin-token: $TOKEN" $BASE/admin/scenarios/inventory-oversell/stop
```

### `blocked-customer-retry-storm`

- **Activates:** the generator fires tight bursts (per intake tick, `3×factor` orders) from a single chargeback-blocked customer (`cus_blk4h2q`, "Devon Cross").
- **Logs:** a storm of `order_rejected errorCode=ERR_CUSTOMER_BLOCKED {customerId, channel, reason: chargeback_history}` all from the same `customerId`.
- **Demo:** hundreds of rejections from *one* `customerId` in a short window → a single abusive/retrying actor, not a systemic failure. (Burst cadence follows the intake tick; raise `orderRatePerMin` via `/admin/config` for a denser storm.)

```bash
curl -s -X POST -H "x-acme-admin-token: $TOKEN" -H 'content-type: application/json' \
  -d '{"durationMinutes":10,"intensity":"high"}' $BASE/admin/scenarios/blocked-customer-retry-storm/start | jq
curl -s -X POST -H "x-acme-admin-token: $TOKEN" $BASE/admin/scenarios/blocked-customer-retry-storm/stop
```

### `stuck-orders-webhook`

- **Activates:** `onStart` logs `webhook_delivery_degraded {endpoint: payments.capture.confirm}`. While active the gateway authorizes but withholds capture confirmations, so orders park in FULFILLING; the sweeper reports them. `onStop` logs `webhook_delivery_recovered` and the pending captures drain (ship) — or dead-letter to `orders.capture.dlq` if they aged out (20 confirmation attempts).
- **Logs:** `order_stuck_pending errorCode=ERR_PAYMENT_CONFIRMATION_TIMEOUT {orderId, customerId, ageSeconds, state: FULFILLING}` (from the sweeper), then `capture_confirmation_recovered` on stop.
- **Demo:** a growing backlog of orders stuck in FULFILLING with an aging clock, correlated with a degraded capture-confirmation webhook → an un-settled-payment backlog.

```bash
curl -s -X POST -H "x-acme-admin-token: $TOKEN" -H 'content-type: application/json' \
  -d '{"durationMinutes":15,"intensity":"medium"}' $BASE/admin/scenarios/stuck-orders-webhook/start | jq
curl -s -X POST -H "x-acme-admin-token: $TOKEN" $BASE/admin/scenarios/stuck-orders-webhook/stop
```

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
