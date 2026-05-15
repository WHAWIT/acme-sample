import { Injectable } from '@nestjs/common';
import { ProductCache } from '../cache/product-cache';
import { createLogger } from '../common/logger';
import { OrderLine } from '../domain/order.entity';
import { ScenarioEngine } from '../scenarios/scenario.engine';
import { StockLedger } from './stock-allocator';

const log = createLogger('inventory-service');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** How long a cached stock read stays authoritative under normal operation. */
const STOCK_CACHE_FRESH_MS = 30_000;
/** Upper bound on how stale a cache entry may be served when refreshes lag. */
const STOCK_CACHE_MAX_STALE_MS = 10 * 60_000;
const SLOW_CHECK_THRESHOLD_MS = 500;

export interface AvailabilityResult {
  sku: string;
  available: boolean;
  onHand: number;
}

@Injectable()
export class InventoryService {
  constructor(
    private readonly engine: ScenarioEngine,
    private readonly cache: ProductCache,
    private readonly ledger: StockLedger,
  ) {}

  async checkAvailability(lines: OrderLine[]): Promise<AvailabilityResult[]> {
    const started = Date.now();
    await sleep(30 + Math.random() * 120);
    if (this.engine.isActive('checkout-latency-spike')) {
      await sleep(this.engine.factor('checkout-latency-spike') * 1000 + Math.random() * 1000);
    }

    const results = lines.map((line) => {
      const onHand = this.readStock(line.sku);
      return { sku: line.sku, available: onHand >= line.quantity, onHand };
    });

    const latencyMs = Date.now() - started;
    if (latencyMs > SLOW_CHECK_THRESHOLD_MS) {
      log.warn(
        { event: 'availability_check_slow', latencyMs, thresholdMs: SLOW_CHECK_THRESHOLD_MS, skuCount: lines.length },
        `availability check took ${latencyMs}ms (threshold ${SLOW_CHECK_THRESHOLD_MS}ms)`,
      );
    }
    return results;
  }

  getOnHand(sku: string): number {
    return this.ledger.onHand(sku);
  }

  private readStock(sku: string): number {
    const key = `stock:${sku}`;
    const cached = this.cache.get(key);
    if (cached !== undefined) {
      const ageMs = Date.now() - cached.cachedAt;
      if (ageMs <= STOCK_CACHE_FRESH_MS) {
        return cached.onHand;
      }
      if (this.engine.isActive('inventory-desync') && ageMs <= STOCK_CACHE_MAX_STALE_MS) {
        log.debug(
          { event: 'stock_cache_stale_read', sku, ageMs, onHand: cached.onHand },
          `serving stock for ${sku} from cache (${Math.round(ageMs / 1000)}s old)`,
        );
        return cached.onHand;
      }
    }
    const onHand = this.ledger.onHand(sku);
    this.cache.set(key, { onHand, cachedAt: Date.now() });
    return onHand;
  }
}
