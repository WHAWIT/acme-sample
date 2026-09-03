# ACME Orders

Order processing platform for ACME Commerce. Handles order intake, pricing,
payment authorization, fraud screening, inventory allocation, fulfillment and
shipping across our US and EU warehouses.

## Architecture

Single NestJS service (Cloud Run) with modular domains:

- `orders/` — order lifecycle state machine and pipeline orchestration
- `catalog/` — product catalog and SKU validation
- `pricing/` — pricing, promotions and tax calculation
- `payments/` — payment gateway client with circuit breaker
- `inventory/` — stock ledger, availability checks and allocation
- `fraud/` — fraud scoring and manual review holds
- `shipping/` — carrier selection and delivery estimation
- `reports/` — operational reporting

Order lifecycle:

```
RECEIVED → VALIDATED → PRICED → PAYMENT_AUTHORIZED → FRAUD_CLEARED
        → ALLOCATED → FULFILLING → SHIPPED → DELIVERED
```

with failure branches for rejections, payment declines, fraud holds,
backorders and cancellations.

## API

| Endpoint | Description |
|---|---|
| `GET /api/products` | List catalog (optional `?category=`) |
| `GET /api/products/:sku` | Product detail |
| `POST /api/orders` | Create order (supports `Idempotency-Key` header) |
| `GET /api/orders/:id` | Order detail |
| `GET /api/orders?customerId=` | Orders by customer |
| `POST /api/checkout/quote` | Price + availability quote |
| `GET /api/orders/:id/tracking` | Shipment tracking |
| `GET /api/reports/daily` | Daily operations report |
| `GET /healthz` | Health check |

## Development

```bash
npm install
npm run start:dev
```

## Observability

Logs are single-line JSON on stdout, collected by Google Cloud Logging.

- Every line carries the deployment context: `version`, `revision` (Cloud Run
  `K_REVISION`), `commitSha`, `environment`, `region`, `instanceId`.
- Every line about an order carries `orderId`, `customerId`, `channel`,
  `appVersion`, `traceId` and the Cloud Logging trace field
  (`logging.googleapis.com/trace`), including the asynchronous pipeline hops.
  An incoming `traceparent` or `x-cloud-trace-context` header is honoured.
- ERROR lines carry the exception as `err` (`type`, `message`, `stack`) plus
  `logging.googleapis.com/sourceLocation` (file, line, function) of the frame
  that raised it. Infrastructure failures are typed errors:
  `PoolTimeoutError`, `GatewayError`, `GatewayTimeoutError`, `CircuitOpenError`.
- Healthy `GET` requests under one second log at DEBUG; writes, 4xx/5xx and
  slow requests stay at INFO/WARNING.
- Each deployment (and the `bad-deploy-npe` scenario's simulated release and
  rollback) is reported to Whawit as a change event when `CHANGE_WEBHOOK_URL`
  is set, so incident analysis can correlate failures with what shipped.

| Env var | Default | Purpose |
|---|---|---|
| `COMMIT_SHA` | `unknown` | commit stamped on every log line and reported on deploy |
| `ENVIRONMENT` / `REGION` / `GCP_PROJECT` | `production` / `us-central1` / `whawit` | runtime context and trace resource name |
| `CHANGE_WEBHOOK_URL` | unset | Whawit change webhook (carries its own token; never logged) |
| `BAD_DEPLOY_SHA` | `COMMIT_SHA` | commit the simulated v1.5.0 release points at |
| `ORDER_RATE_PER_MIN` / `QUERY_RATE_PER_MIN` | `8` / `6` | synthetic traffic rates (tunable via `/admin/config`) |

## Deployment

Cloud Run via `deploy/deploy.sh` (`COMMIT_SHA=<sha> bash deploy/deploy.sh v1.4.3`).
