export enum OrderState {
  Received = 'RECEIVED',
  Validated = 'VALIDATED',
  Priced = 'PRICED',
  PaymentAuthorized = 'PAYMENT_AUTHORIZED',
  FraudCleared = 'FRAUD_CLEARED',
  Allocated = 'ALLOCATED',
  Fulfilling = 'FULFILLING',
  Shipped = 'SHIPPED',
  Delivered = 'DELIVERED',
  // Failure branches
  Rejected = 'REJECTED',
  PricingFailed = 'PRICING_FAILED',
  PaymentDeclined = 'PAYMENT_DECLINED',
  FraudHold = 'FRAUD_HOLD',
  Backordered = 'BACKORDERED',
  Cancelled = 'CANCELLED',
  Failed = 'FAILED',
}

export interface OrderLine {
  sku: string;
  quantity: number;
  unitPrice: number;
}

/** Origin of the checkout. A primary correlation dimension across logs. */
export type OrderChannel = 'web' | 'mobile' | 'api';

export interface Order {
  id: string;
  customerId: string;
  customerName: string;
  b2b: boolean;
  /** Correlation dimensions carried on every failure log and state change. */
  channel: OrderChannel;
  appVersion: string;
  cardBin: string;
  issuer: string;
  lines: OrderLine[];
  currency: string;
  promoCode?: string;
  shippingAddress: {
    street: string;
    city: string;
    country: string;
    zip?: string;
  };
  warehouse: string;
  state: OrderState;
  subtotal?: number;
  total?: number;
  authorizedAmount?: number;
  fraudScore?: number;
  paymentAttempts: number;
  allocationAttempts: number;
  captureAttempts: number;
  idempotencyKey?: string;
  createdAt: Date;
  updatedAt: Date;
  history: Array<{ from: OrderState; to: OrderState; at: Date; reason?: string }>;
}

export const TERMINAL_STATES = new Set<OrderState>([
  OrderState.Delivered,
  OrderState.Rejected,
  OrderState.PaymentDeclined,
  OrderState.Cancelled,
]);
