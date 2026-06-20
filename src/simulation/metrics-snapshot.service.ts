import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { OrdersService } from '../orders/orders.service';
import { DbPool } from '../infra/db-pool';
import { ProductCache } from '../cache/product-cache';
import { createLogger } from '../common/logger';
import { OrderGeneratorService } from './order-generator.service';

const log = createLogger('order-service');

const SNAPSHOT_INTERVAL_MS = 30_000;
const MB = 1_048_576;

/**
 * Periodic process/pool/cache gauge dump. One INFO line every 30s keeps
 * dashboards fed without a metrics agent.
 */
@Injectable()
export class MetricsSnapshotService implements OnApplicationBootstrap {
  constructor(
    private readonly orders: OrdersService,
    private readonly generator: OrderGeneratorService,
    private readonly dbPool: DbPool,
    private readonly cache: ProductCache,
  ) {}

  onApplicationBootstrap(): void {
    const timer = setInterval(() => this.snapshot(), SNAPSHOT_INTERVAL_MS);
    timer.unref?.();
  }

  private snapshot(): void {
    try {
      const mem = process.memoryUsage();
      const heapUsedMb = Math.round(mem.heapUsed / MB);
      const rssMb = Math.round(mem.rss / MB);
      const pool: any = this.dbPool.stats();
      const cache: any = this.cache.stats();
      const cacheHitRatio = Math.round(Number(cache.hitRatio ?? 0) * 1000) / 1000;
      const activeOrders = this.orders.activeCount();
      const ordersToday = this.generator.ordersToday();

      log.info(
        {
          event: 'metrics_snapshot',
          heapUsedMb,
          rssMb,
          poolInUse: pool.inUse,
          poolSize: pool.size,
          poolWaiting: pool.waiting,
          cacheSize: cache.size,
          cacheHitRatio,
          activeOrders,
          ordersToday,
        },
        `metrics snapshot: heap ${heapUsedMb}MB pool ${pool.inUse}/${pool.size} cache hit ${cacheHitRatio}`,
      );
    } catch (err) {
      log.warn({ event: 'metrics_snapshot_failed', err }, 'Failed to collect metrics snapshot');
    }
  }
}
