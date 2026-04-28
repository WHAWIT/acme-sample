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

## Deployment

Cloud Run via `deploy/deploy.sh`. Logs are structured JSON on stdout,
collected by Google Cloud Logging.
