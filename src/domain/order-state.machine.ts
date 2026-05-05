import { OrderState } from './order.entity';

/**
 * Legal transitions for the order pipeline. The pipeline service is the
 * only writer; anything else must go through it.
 */
const TRANSITIONS: Record<string, OrderState[]> = {
  [OrderState.Received]: [OrderState.Validated, OrderState.Rejected, OrderState.Failed],
  [OrderState.Validated]: [OrderState.Priced, OrderState.Rejected, OrderState.Failed],
  [OrderState.Priced]: [
    OrderState.PaymentAuthorized,
    OrderState.PricingFailed,
    OrderState.PaymentDeclined,
    OrderState.Failed,
  ],
  [OrderState.PricingFailed]: [OrderState.Priced, OrderState.Rejected],
  [OrderState.PaymentAuthorized]: [OrderState.FraudCleared, OrderState.FraudHold, OrderState.Failed],
  [OrderState.FraudHold]: [OrderState.FraudCleared, OrderState.Cancelled],
  [OrderState.FraudCleared]: [OrderState.Allocated, OrderState.Backordered, OrderState.Failed],
  [OrderState.Backordered]: [OrderState.Allocated, OrderState.Cancelled],
  [OrderState.Allocated]: [OrderState.Fulfilling, OrderState.Failed],
  [OrderState.Fulfilling]: [OrderState.Shipped, OrderState.Failed],
  [OrderState.Shipped]: [OrderState.Delivered, OrderState.Failed],
};

export function canTransition(from: OrderState, to: OrderState): boolean {
  return (TRANSITIONS[from] ?? []).includes(to);
}

export function assertTransition(from: OrderState, to: OrderState): void {
  if (!canTransition(from, to)) {
    throw new Error(`Illegal order state transition ${from} -> ${to}`);
  }
}
