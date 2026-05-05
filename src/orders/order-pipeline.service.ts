import { Injectable } from '@nestjs/common';
import { createLogger } from '../common/logger';
import { FailureCode, OrderProcessingError } from '../domain/failure-codes';
import { Order, OrderState, TERMINAL_STATES } from '../domain/order.entity';
import { assertTransition, canTransition } from '../domain/order-state.machine';
import { CatalogService } from '../catalog/catalog.service';
import { SkuValidator } from '../catalog/sku.validator';
import { PricingService } from '../pricing/pricing.service';
import { PaymentClient } from '../payments/payment-client';
import { FraudService } from '../fraud/fraud.service';
import { StockAllocator } from '../inventory/stock-allocator';
import { ShippingService } from '../shipping/shipping.service';
import { OrderRepository } from './order.repository';

const log = createLogger('order-service');

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Per-hop scheduling delay. Eight hops on the happy path at an average of
 * a little over eleven seconds per hop puts a full order lifecycle at
 * roughly ninety seconds end to end.
 */
const STEP_DELAY_MIN_MS = Number(process.env.PIPELINE_STEP_MIN_MS || 500);
const STEP_DELAY_MAX_MS = Number(process.env.PIPELINE_STEP_MAX_MS || 22_000);

const PAYMENT_MAX_DECLINE_ATTEMPTS = 2;
const GATEWAY_MAX_RETRIES = 3;
const GATEWAY_BACKOFF_BASE_MS = 2_000;
const FRAUD_HOLD_THRESHOLD = 0.85;
const BACKORDER_MAX_ATTEMPTS = 3;
const BACKORDER_RETRY_MIN_MS = 10_000;
const BACKORDER_RETRY_MAX_MS = 30_000;

const GATEWAY_FAILURE_CODES = new Set<FailureCode>([
  FailureCode.GatewayBadGateway,
  FailureCode.GatewayTimeout,
  FailureCode.CircuitOpen,
]);

/**
 * Drives every order through the state machine. This service is the only
 * writer of order state; each hop is scheduled asynchronously so a burst
 * of submissions never blocks the API.
 */
@Injectable()
export class OrderPipelineService {
  constructor(
    private readonly repository: OrderRepository,
    private readonly catalog: CatalogService,
    private readonly pricing: PricingService,
    private readonly payments: PaymentClient,
    private readonly fraud: FraudService,
    private readonly allocator: StockAllocator,
    private readonly shipping: ShippingService,
  ) {}

  submit(order: Order): void {
    this.queue(order, () => this.validateStep(order));
  }

  private queue(order: Order, step: () => Promise<void>, delayMs?: number): void {
    setTimeout(
      () => {
        step().catch((err) => this.deadLetter(order, err));
      },
      delayMs ?? this.hopDelay(),
    );
  }

  private hopDelay(): number {
    return STEP_DELAY_MIN_MS + Math.random() * (STEP_DELAY_MAX_MS - STEP_DELAY_MIN_MS);
  }

  private transition(order: Order, to: OrderState, stepStartedAt: number, reason?: string): void {
    assertTransition(order.state, to);
    const prev = order.state;
    order.state = to;
    order.updatedAt = new Date();
    order.history.push({ from: prev, to, at: order.updatedAt, reason });
    this.repository.save(order);
    log.info(
      {
        event: 'order_state_changed',
        orderId: order.id,
        customerId: order.customerId,
        state: to,
        prevState: prev,
        latencyMs: Date.now() - stepStartedAt,
        amount: order.total,
        sku: order.lines.map((l) => l.sku),
      },
      `Order ${order.id} ${prev} -> ${to}`,
    );
  }

  private async validateStep(order: Order): Promise<void> {
    const started = Date.now();
    await sleep(20 + Math.random() * 80);
    for (const line of order.lines) {
      if (!SkuValidator.isValid(line.sku) || !this.catalog.getProduct(line.sku)) {
        log.warn(
          {
            event: 'order_rejected',
            errorCode: FailureCode.InvalidSku,
            orderId: order.id,
            customerId: order.customerId,
            sku: line.sku,
          },
          `Order ${order.id} rejected: unknown or malformed SKU ${line.sku}`,
        );
        this.transition(order, OrderState.Rejected, started, `invalid sku ${line.sku}`);
        return;
      }
    }
    this.transition(order, OrderState.Validated, started);
    this.queue(order, () => this.priceStep(order));
  }

  private async priceStep(order: Order): Promise<void> {
    const started = Date.now();
    try {
      const { subtotal, total } = await this.pricing.price(order);
      order.subtotal = subtotal;
      order.total = total;
      this.transition(order, OrderState.Priced, started);
      this.queue(order, () => this.authorizeStep(order));
    } catch (err) {
      if (err instanceof OrderProcessingError && err.code === FailureCode.PromoExpired) {
        log.warn(
          {
            event: 'promo_rejected',
            errorCode: FailureCode.PromoExpired,
            orderId: order.id,
            customerId: order.customerId,
            promoCode: order.promoCode,
          },
          `Promo code ${order.promoCode} expired; repricing order ${order.id} without promo`,
        );
        order.promoCode = undefined;
        const { subtotal, total } = await this.pricing.price(order);
        order.subtotal = subtotal;
        order.total = total;
        this.transition(order, OrderState.Priced, started, 'repriced without expired promo');
        this.queue(order, () => this.authorizeStep(order));
        return;
      }
      if (err instanceof TypeError) {
        await this.recoverFromPricingFailure(order, err, started);
        return;
      }
      throw err;
    }
  }

  private async recoverFromPricingFailure(order: Order, err: TypeError, started: number): Promise<void> {
    log.error(
      {
        event: 'pricing_failure',
        errorCode: FailureCode.PricingFailure,
        orderId: order.id,
        customerId: order.customerId,
        promoCode: order.promoCode,
        err,
      },
      `Unhandled error pricing order ${order.id} with promo ${order.promoCode}`,
    );
    // The state machine only reaches PRICING_FAILED via PRICED, so record
    // that the order entered the pricing stage before flagging the failure.
    this.transition(order, OrderState.Priced, started, 'pricing attempt errored');
    this.transition(order, OrderState.PricingFailed, started, err.message);
    const promo = order.promoCode;
    order.promoCode = undefined;
    try {
      const retryStarted = Date.now();
      const { subtotal, total } = await this.pricing.price(order);
      order.subtotal = subtotal;
      order.total = total;
      this.transition(order, OrderState.Priced, retryStarted, `repriced without promo ${promo}`);
      this.queue(order, () => this.authorizeStep(order));
    } catch (retryErr) {
      log.warn(
        {
          event: 'order_rejected',
          errorCode: FailureCode.PricingFailure,
          orderId: order.id,
          customerId: order.customerId,
          promoCode: promo,
          err: retryErr,
        },
        `Order ${order.id} rejected: repricing without promo ${promo} failed`,
      );
      this.transition(order, OrderState.Rejected, started, 'repricing failed');
    }
  }

  private async authorizeStep(order: Order): Promise<void> {
    const started = Date.now();
    order.paymentAttempts += 1;
    try {
      const authorizedCents = await this.payments.authorize(order);
      order.authorizedAmount = authorizedCents / 100;
      this.transition(order, OrderState.PaymentAuthorized, started);
      this.queue(order, () => this.fraudStep(order));
    } catch (err) {
      if (
        err instanceof OrderProcessingError &&
        (err.code === FailureCode.PaymentDeclined || err.code === FailureCode.CreditLimit)
      ) {
        if (order.paymentAttempts >= PAYMENT_MAX_DECLINE_ATTEMPTS) {
          log.warn(
            {
              event: 'payment_declined',
              errorCode: err.code,
              orderId: order.id,
              customerId: order.customerId,
              amount: order.total,
              attempts: order.paymentAttempts,
            },
            `Payment declined for order ${order.id} after ${order.paymentAttempts} attempts`,
          );
          this.transition(order, OrderState.PaymentDeclined, started, err.message);
          return;
        }
        log.info(
          {
            event: 'payment_retry_scheduled',
            errorCode: err.code,
            orderId: order.id,
            attempt: order.paymentAttempts,
          },
          `Payment attempt ${order.paymentAttempts} declined for order ${order.id}; retrying`,
        );
        this.repository.save(order);
        this.queue(order, () => this.authorizeStep(order), GATEWAY_BACKOFF_BASE_MS + Math.random() * 2_000);
        return;
      }
      if (err instanceof OrderProcessingError && GATEWAY_FAILURE_CODES.has(err.code)) {
        if (order.paymentAttempts > GATEWAY_MAX_RETRIES) {
          log.error(
            {
              event: 'order_processing_failed',
              errorCode: err.code,
              orderId: order.id,
              customerId: order.customerId,
              amount: order.total,
              attempts: order.paymentAttempts,
              err,
            },
            `Payment authorization failed for order ${order.id} after ${order.paymentAttempts} attempts`,
          );
          this.transition(order, OrderState.Failed, started, err.message);
          log.error(
            {
              event: 'order_dead_lettered',
              errorCode: err.code,
              orderId: order.id,
              customerId: order.customerId,
              queue: 'orders.payment.dlq',
              attempts: order.paymentAttempts,
            },
            `Order ${order.id} dead-lettered after exhausting payment gateway retries`,
          );
          return;
        }
        const backoffMs = Math.round(
          GATEWAY_BACKOFF_BASE_MS * Math.pow(2, order.paymentAttempts - 1) + Math.random() * 1_000,
        );
        log.warn(
          {
            event: 'payment_gateway_retry',
            errorCode: err.code,
            orderId: order.id,
            attempt: order.paymentAttempts,
            backoffMs,
          },
          `Payment gateway error for order ${order.id}; retrying in ${backoffMs}ms`,
        );
        this.repository.save(order);
        this.queue(order, () => this.authorizeStep(order), backoffMs);
        return;
      }
      throw err;
    }
  }

  private async fraudStep(order: Order): Promise<void> {
    const started = Date.now();
    const score = await this.fraud.score(order);
    order.fraudScore = score;
    if (score > FRAUD_HOLD_THRESHOLD) {
      log.warn(
        {
          event: 'fraud_hold',
          errorCode: FailureCode.FraudHold,
          orderId: order.id,
          customerId: order.customerId,
          fraudScore: score,
          amount: order.total,
        },
        `Order ${order.id} placed on fraud hold (score ${score.toFixed(2)})`,
      );
      this.transition(order, OrderState.FraudHold, started, `fraud score ${score.toFixed(2)}`);
      this.queue(order, () => this.fraudReviewStep(order));
      return;
    }
    this.transition(order, OrderState.FraudCleared, started);
    this.queue(order, () => this.allocateStep(order));
  }

  private async fraudReviewStep(order: Order): Promise<void> {
    const started = Date.now();
    const outcome = await this.fraud.releaseHold(order);
    if (outcome === 'released') {
      log.info(
        {
          event: 'fraud_hold_released',
          orderId: order.id,
          customerId: order.customerId,
          fraudScore: order.fraudScore,
        },
        `Fraud hold released for order ${order.id}`,
      );
      this.transition(order, OrderState.FraudCleared, started, 'review released hold');
      this.queue(order, () => this.allocateStep(order));
      return;
    }
    log.warn(
      {
        event: 'fraud_hold_cancelled',
        errorCode: FailureCode.FraudHold,
        orderId: order.id,
        customerId: order.customerId,
        fraudScore: order.fraudScore,
        amount: order.total,
      },
      `Order ${order.id} cancelled after fraud review`,
    );
    this.transition(order, OrderState.Cancelled, started, 'fraud review cancelled order');
  }

  private async allocateStep(order: Order): Promise<void> {
    const started = Date.now();
    order.allocationAttempts += 1;
    try {
      await this.allocator.allocate(order);
      this.transition(order, OrderState.Allocated, started);
      this.queue(order, () => this.fulfillStep(order));
    } catch (err) {
      if (err instanceof OrderProcessingError && err.code === FailureCode.InsufficientStock && err.retryable) {
        if (order.allocationAttempts >= BACKORDER_MAX_ATTEMPTS) {
          log.error(
            {
              event: 'backorder_expired',
              errorCode: FailureCode.InsufficientStock,
              orderId: order.id,
              customerId: order.customerId,
              warehouse: order.warehouse,
              attempts: order.allocationAttempts,
              sku: order.lines.map((l) => l.sku),
            },
            `Backorder expired for order ${order.id} after ${order.allocationAttempts} allocation attempts`,
          );
          this.transition(order, OrderState.Cancelled, started, 'backorder expired');
          return;
        }
        if (order.state !== OrderState.Backordered) {
          log.warn(
            {
              event: 'order_backordered',
              errorCode: FailureCode.InsufficientStock,
              orderId: order.id,
              warehouse: order.warehouse,
              attempt: order.allocationAttempts,
              sku: order.lines.map((l) => l.sku),
            },
            `Insufficient stock for order ${order.id}; moved to backorder`,
          );
          this.transition(order, OrderState.Backordered, started, err.message);
        } else {
          log.warn(
            {
              event: 'backorder_retry_failed',
              errorCode: FailureCode.InsufficientStock,
              orderId: order.id,
              warehouse: order.warehouse,
              attempt: order.allocationAttempts,
            },
            `Backorder retry ${order.allocationAttempts} failed for order ${order.id}; still out of stock`,
          );
          this.repository.save(order);
        }
        this.queue(
          order,
          () => this.allocateStep(order),
          BACKORDER_RETRY_MIN_MS + Math.random() * (BACKORDER_RETRY_MAX_MS - BACKORDER_RETRY_MIN_MS),
        );
        return;
      }
      throw err;
    }
  }

  private async fulfillStep(order: Order): Promise<void> {
    const started = Date.now();
    await sleep(50 + Math.random() * 200);
    this.transition(order, OrderState.Fulfilling, started);
    try {
      await this.payments.capture(order);
    } catch (err) {
      if (err instanceof OrderProcessingError && err.code === FailureCode.AmountMismatch) {
        // The payment client has already logged the mismatch with both
        // amounts; align the authorization with the order total and move on.
        order.authorizedAmount = order.total;
        this.repository.save(order);
        log.info(
          {
            event: 'amount_mismatch_reconciled',
            orderId: order.id,
            customerId: order.customerId,
            amount: order.total,
          },
          `Capture for order ${order.id} reconciled to ${order.total}`,
        );
      } else {
        throw err;
      }
    }
    this.queue(order, () => this.shipStep(order));
  }

  private async shipStep(order: Order): Promise<void> {
    const started = Date.now();
    try {
      await this.shipping.arrangeShipment(order);
      this.transition(order, OrderState.Shipped, started);
      this.queue(order, () => this.deliverStep(order));
    } catch (err) {
      if (err instanceof OrderProcessingError && err.code === FailureCode.NoCarrier) {
        log.warn(
          {
            event: 'shipment_rejected',
            errorCode: FailureCode.NoCarrier,
            orderId: order.id,
            warehouse: order.warehouse,
            amount: order.total,
          },
          `No carrier available for order ${order.id}`,
        );
        this.transition(order, OrderState.Failed, started, 'no carrier available');
        return;
      }
      throw err;
    }
  }

  private async deliverStep(order: Order): Promise<void> {
    const started = Date.now();
    await sleep(50 + Math.random() * 150);
    this.transition(order, OrderState.Delivered, started);
    log.info(
      {
        event: 'order_delivered',
        orderId: order.id,
        customerId: order.customerId,
        amount: order.total,
        latencyMs: Date.now() - order.createdAt.getTime(),
      },
      `Order ${order.id} delivered`,
    );
  }

  private deadLetter(order: Order, err: unknown): void {
    const cause = err instanceof Error ? err : new Error(String(err));
    log.error(
      {
        event: 'order_processing_failed',
        errorCode: cause instanceof OrderProcessingError ? cause.code : undefined,
        orderId: order.id,
        customerId: order.customerId,
        state: order.state,
        amount: order.total,
        err: cause,
      },
      `Unexpected error processing order ${order.id} in state ${order.state}`,
    );
    if (TERMINAL_STATES.has(order.state) || order.state === OrderState.Failed) {
      return;
    }
    if (canTransition(order.state, OrderState.Failed)) {
      this.transition(order, OrderState.Failed, Date.now(), cause.message);
      return;
    }
    // FAILED is the dead-letter state and must always be reachable, even
    // from states the machine gives no explicit edge for.
    const prev = order.state;
    order.state = OrderState.Failed;
    order.updatedAt = new Date();
    order.history.push({ from: prev, to: OrderState.Failed, at: order.updatedAt, reason: cause.message });
    this.repository.save(order);
    log.info(
      {
        event: 'order_state_changed',
        orderId: order.id,
        customerId: order.customerId,
        state: OrderState.Failed,
        prevState: prev,
        amount: order.total,
        sku: order.lines.map((l) => l.sku),
      },
      `Order ${order.id} ${prev} -> ${OrderState.Failed}`,
    );
  }
}
