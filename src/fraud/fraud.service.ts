import { Injectable } from '@nestjs/common';
import { createLogger } from '../common/logger';
import { FailureCode } from '../domain/failure-codes';
import { Order } from '../domain/order.entity';

const log = createLogger('fraud-service');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const MANUAL_REVIEW_THRESHOLD = 0.85;

@Injectable()
export class FraudService {
  /**
   * Risk score in [0, 1). Blends stable per-order/customer signals with
   * transaction-time noise; velocity and mismatch heuristics push a small
   * fraction of orders over the manual-review threshold.
   */
  async score(order: Order): Promise<number> {
    const started = Date.now();
    await sleep(40 + Math.random() * 160);

    const base = 0.05 + this.hash(order.id + order.customerId) * 0.5 + Math.random() * 0.25;
    let score = base;
    if (Math.random() < 0.015) {
      // Velocity/identity-mismatch heuristics flag the order outright.
      score = 0.86 + Math.random() * 0.12;
    }
    score = Math.round(score * 100) / 100;

    const latencyMs = Date.now() - started;
    log.info(
      { event: 'fraud_scored', orderId: order.id, score, latencyMs },
      `Fraud score ${score} for order ${order.id}`,
    );
    if (score > MANUAL_REVIEW_THRESHOLD) {
      log.warn(
        { event: 'fraud_hold', errorCode: FailureCode.FraudHold, orderId: order.id, score },
        `Order placed on manual fraud review (score ${score})`,
      );
    }
    return score;
  }

  /** Manual review outcome for an order previously placed on hold. */
  async releaseHold(order: Order): Promise<'released' | 'cancelled'> {
    const started = Date.now();
    await sleep(500 + Math.random() * 1000);
    const latencyMs = Date.now() - started;

    if (Math.random() < 0.7) {
      log.info(
        { event: 'fraud_hold_released', orderId: order.id, score: order.fraudScore, latencyMs },
        `Manual review released hold on order ${order.id}`,
      );
      return 'released';
    }
    log.warn(
      {
        event: 'fraud_hold_cancelled',
        errorCode: FailureCode.FraudHold,
        orderId: order.id,
        score: order.fraudScore,
        latencyMs,
      },
      `Manual review cancelled order ${order.id} after fraud hold`,
    );
    return 'cancelled';
  }

  private hash(input: string): number {
    let h = 2166136261;
    for (let i = 0; i < input.length; i++) {
      h ^= input.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0) / 0xffffffff;
  }
}
