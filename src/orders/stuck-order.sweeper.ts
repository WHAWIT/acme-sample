import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { createLogger } from '../common/logger';
import { FailureCode } from '../domain/failure-codes';
import { OrderState } from '../domain/order.entity';
import { OrderRepository } from './order.repository';

const log = createLogger('stuck-order-sweeper');

/**
 * Post-authorization states an order should pass through quickly. If one lingers
 * here it is waiting on something downstream (typically an un-confirmed payment
 * capture) rather than a legitimately slow step. FRAUD_HOLD and BACKORDERED are
 * excluded — they have their own review/retry clocks and are slow by design.
 */
const STUCK_STATES = new Set<OrderState>([
  OrderState.PaymentAuthorized,
  OrderState.FraudCleared,
  OrderState.Allocated,
  OrderState.Fulfilling,
]);

const SWEEP_INTERVAL_MS = Number(process.env.STUCK_ORDER_SWEEP_MS || 60_000);
const STUCK_AGE_MS = Number(process.env.STUCK_ORDER_AGE_MS || 120_000);
const MAX_REPORTS_PER_ORDER = 3;

/**
 * Background watchdog. Every minute it scans in-flight orders and re-reports any
 * that have sat in a post-authorization state past the age threshold without
 * advancing. It never changes order state — it only surfaces the stall, up to
 * three times per order with a growing age.
 */
@Injectable()
export class StuckOrderSweeper implements OnApplicationBootstrap {
  private readonly reportCounts = new Map<string, number>();

  constructor(private readonly repository: OrderRepository) {}

  onApplicationBootstrap(): void {
    const timer = setInterval(() => this.sweep(), SWEEP_INTERVAL_MS);
    timer.unref?.();
    log.info(
      { event: 'stuck_order_sweeper_started', intervalMs: SWEEP_INTERVAL_MS, ageThresholdMs: STUCK_AGE_MS },
      `Stuck-order sweeper started (every ${Math.round(SWEEP_INTERVAL_MS / 1000)}s, threshold ${Math.round(STUCK_AGE_MS / 1000)}s)`,
    );
  }

  private sweep(): void {
    const now = Date.now();
    const live = new Set<string>();

    for (const order of this.repository.activeInPipeline()) {
      live.add(order.id);
      if (!STUCK_STATES.has(order.state)) continue;

      const ageMs = now - order.updatedAt.getTime();
      if (ageMs < STUCK_AGE_MS) continue;

      const reported = this.reportCounts.get(order.id) ?? 0;
      if (reported >= MAX_REPORTS_PER_ORDER) continue;
      this.reportCounts.set(order.id, reported + 1);

      const ageSeconds = Math.round(ageMs / 1000);
      log.error(
        {
          event: 'order_stuck_pending',
          errorCode: FailureCode.PaymentConfirmationTimeout,
          orderId: order.id,
          customerId: order.customerId,
          ageSeconds,
          state: order.state,
          channel: order.channel,
          appVersion: order.appVersion,
          reportCount: reported + 1,
        },
        `Order ${order.id} stuck in ${order.state} for ${ageSeconds}s awaiting payment confirmation`,
      );
    }

    // Drop bookkeeping for orders that have since left the pipeline.
    for (const id of this.reportCounts.keys()) {
      if (!live.has(id)) this.reportCounts.delete(id);
    }
  }
}
