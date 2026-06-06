import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { createLogger } from '../common/logger';
import { FailureCode } from '../domain/failure-codes';
import { OrderRepository } from '../orders/order.repository';

const log = createLogger('order-service');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Aggregated daily reporting over the orders store. The aggregation runs
 * full-partition scans, so response times vary heavily with data volume
 * and concurrent pipeline load.
 */
@Injectable()
export class ReportsService {
  constructor(private readonly repository: OrderRepository) {}

  async dailyReport(): Promise<object> {
    const startedAt = Date.now();
    const date = new Date().toISOString().slice(0, 10);
    const partition = date.slice(0, 7);
    const roll = Math.random();

    if (roll < 0.1) {
      // Cold partitions occasionally force a full re-scan of the day's data.
      await sleep(12_000 + Math.random() * 8_000);
    } else {
      await sleep(2_000 + Math.random() * 6_000);
    }

    if (roll >= 0.1 && roll < 0.15) {
      const err = new Error(
        `GROUP BY memory limit exceeded processing orders partition ${partition}`,
      );
      log.error(
        { event: 'report_generation_failed', err, date },
        'Daily report aggregation failed',
      );
      throw new InternalServerErrorException('Report generation failed');
    }

    const ordersByState = this.repository.countsByState();
    const totalOrders = this.repository.totalToday();
    const revenue =
      Math.round(totalOrders * (140 + Math.random() * 60) * 100) / 100;
    const topFailures = [
      {
        code: FailureCode.PaymentDeclined,
        count: Math.floor(totalOrders * 0.04 + Math.random() * 3),
      },
      {
        code: FailureCode.InsufficientStock,
        count: Math.floor(totalOrders * 0.02 + Math.random() * 2),
      },
      {
        code: FailureCode.FraudHold,
        count: Math.floor(totalOrders * 0.01 + Math.random() * 2),
      },
    ];

    const durationMs = Date.now() - startedAt;
    log.info(
      { event: 'daily_report_generated', durationMs, totalOrders, revenue },
      'Daily report generated',
    );

    return { date, ordersByState, totalOrders, revenue, topFailures };
  }
}
