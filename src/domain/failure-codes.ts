/**
 * Stable error codes used across the order pipeline. Alerting and
 * dashboards key off these values — do not rename without a migration.
 */
export enum FailureCode {
  // Business failures
  InsufficientStock = 'ERR_INSUFFICIENT_STOCK',
  PaymentDeclined = 'ERR_PAYMENT_DECLINED',
  CreditLimit = 'ERR_CREDIT_LIMIT',
  InvalidSku = 'ERR_INVALID_SKU',
  FraudHold = 'ERR_FRAUD_HOLD',
  NoCarrier = 'ERR_NO_CARRIER',
  PromoExpired = 'ERR_PROMO_EXPIRED',
  PricingFailure = 'ERR_PRICING_FAILURE',
  Oversell = 'ERR_OVERSELL',
  PastDeliveryDate = 'ERR_PAST_DELIVERY_DATE',
  AmountMismatch = 'ERR_AMOUNT_MISMATCH',
  DuplicateOrder = 'ERR_DUPLICATE_ORDER',
  MissingShippingZip = 'ERR_MISSING_SHIPPING_ZIP',
  CustomerBlocked = 'ERR_CUSTOMER_BLOCKED',

  // Infrastructure failures
  GatewayBadGateway = 'ERR_GATEWAY_502',
  GatewayTimeout = 'ERR_GATEWAY_TIMEOUT',
  CircuitOpen = 'ERR_CIRCUIT_OPEN',
  PoolTimeout = 'ERR_POOL_TIMEOUT',
  UpstreamTimeout = 'ERR_UPSTREAM_TIMEOUT',
  CapturePending = 'ERR_CAPTURE_PENDING',
  PaymentConfirmationTimeout = 'ERR_PAYMENT_CONFIRMATION_TIMEOUT',
}

export class OrderProcessingError extends Error {
  constructor(
    readonly code: FailureCode,
    message: string,
    readonly retryable = false,
  ) {
    super(message);
    this.name = 'OrderProcessingError';
  }
}
