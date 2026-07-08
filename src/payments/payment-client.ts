import { Injectable } from '@nestjs/common';
import { createLogger } from '../common/logger';
import { FailureCode, OrderProcessingError } from '../domain/failure-codes';
import { Order } from '../domain/order.entity';
import { TaxCalculator } from '../pricing/tax.calculator';
import { PaymentGatewaySim } from './payment.gateway.sim';

const log = createLogger('payment-client');

const DECLINE_REASONS = ['insufficient_funds', 'card_expired', 'do_not_honor'];
const BREAKER_THRESHOLD = 5;
const BREAKER_RESET_MS = 30_000;

type BreakerState = 'closed' | 'open' | 'half-open';

@Injectable()
export class PaymentClient {
  private breaker: BreakerState = 'closed';
  private consecutiveFailures = 0;
  private openedAt = 0;

  constructor(private readonly gateway: PaymentGatewaySim) {}

  async authorize(order: Order): Promise<number> {
    const started = Date.now();

    // Issuer-side declines happen regardless of gateway health.
    if (Math.random() < 0.04) {
      const reason = DECLINE_REASONS[Math.floor(Math.random() * DECLINE_REASONS.length)];
      log.warn(
        { event: 'payment_declined', orderId: order.id, customerId: order.customerId, reason, amount: order.total, channel: order.channel, appVersion: order.appVersion, cardBin: order.cardBin, issuer: order.issuer, errorCode: FailureCode.PaymentDeclined },
        `Payment declined for order ${order.id}: ${reason}`,
      );
      throw new OrderProcessingError(FailureCode.PaymentDeclined, `Payment declined: ${reason}`);
    }
    // Insufficient-funds wave: a single card BIN's issuer starts declining.
    if (this.gateway.insufficientFundsDecline(order.cardBin)) {
      log.warn(
        { event: 'payment_declined', orderId: order.id, customerId: order.customerId, reason: 'insufficient_funds', amount: order.total, channel: order.channel, appVersion: order.appVersion, cardBin: order.cardBin, issuer: order.issuer, errorCode: FailureCode.PaymentDeclined },
        `Payment declined for order ${order.id}: insufficient_funds (BIN ${order.cardBin}/${order.issuer})`,
      );
      throw new OrderProcessingError(FailureCode.PaymentDeclined, `Payment declined: insufficient_funds`);
    }
    if (order.b2b && Math.random() < 0.07) {
      log.warn(
        { event: 'credit_limit_exceeded', orderId: order.id, customerId: order.customerId, amount: order.total, errorCode: FailureCode.CreditLimit },
        `Credit limit exceeded for account ${order.customerId} on order ${order.id}`,
      );
      throw new OrderProcessingError(FailureCode.CreditLimit, `Credit limit exceeded for account ${order.customerId}`);
    }

    const amountCents = Math.round(order.total * 100);
    await this.throughBreaker('authorize', () => this.gateway.authorize(amountCents));

    log.info(
      { event: 'payment_authorized', orderId: order.id, amount: order.total, latencyMs: Date.now() - started },
      `Payment authorized for order ${order.id} (${order.currency} ${order.total})`,
    );
    return amountCents;
  }

  async capture(order: Order): Promise<void> {
    // The gateway may authorize but withhold capture confirmation (async
    // settlement webhook). Signalled before the amount/breaker path so a held
    // confirmation reads as "pending", not a gateway health failure.
    if (this.gateway.captureConfirmationHeld()) {
      throw new OrderProcessingError(
        FailureCode.CapturePending,
        `Capture confirmation pending from gateway for order ${order.id}`,
        true,
      );
    }
    const expectedCents = TaxCalculator.totalCents(Math.round(order.subtotal * 100));
    if (expectedCents !== order.authorizedAmount) {
      const authorized = (order.authorizedAmount / 100).toFixed(2);
      const requested = (expectedCents / 100).toFixed(2);
      const message = `Payment capture failed: amount mismatch (authorized ${authorized}, capture requested ${requested})`;
      log.error(
        { event: 'payment_capture_failed', orderId: order.id, authorized: Number(authorized), requested: Number(requested), errorCode: FailureCode.AmountMismatch },
        message,
      );
      throw new OrderProcessingError(FailureCode.AmountMismatch, message, true);
    }
    await this.throughBreaker('capture', () => this.gateway.capture(order.authorizedAmount));
    log.info({ event: 'payment_captured', orderId: order.id, amount: order.total }, `Payment captured for order ${order.id}`);
  }

  private async throughBreaker<T>(op: string, fn: () => Promise<T>): Promise<T> {
    if (this.breaker === 'open') {
      if (Date.now() - this.openedAt < BREAKER_RESET_MS) {
        throw new OrderProcessingError(FailureCode.CircuitOpen, 'Circuit breaker open for payment-gateway; failing fast', true);
      }
      this.breaker = 'half-open';
      log.info({ event: 'circuit_breaker_half_open' }, 'Circuit breaker half-open for payment-gateway; sending probe');
    }

    try {
      const result = await fn();
      if (this.breaker !== 'closed') {
        log.info({ event: 'circuit_breaker_closed' }, 'Circuit breaker closed for payment-gateway; service recovered');
      }
      this.breaker = 'closed';
      this.consecutiveFailures = 0;
      return result;
    } catch (err) {
      this.consecutiveFailures++;
      if (this.breaker === 'half-open' || (this.breaker === 'closed' && this.consecutiveFailures >= BREAKER_THRESHOLD)) {
        this.breaker = 'open';
        this.openedAt = Date.now();
        log.fatal(
          { event: 'circuit_breaker_open', op, consecutiveFailures: this.consecutiveFailures, errorCode: FailureCode.CircuitOpen },
          `Circuit breaker OPEN for payment-gateway after ${this.consecutiveFailures} consecutive failures`,
        );
      }
      throw err;
    }
  }
}
