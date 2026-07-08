import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { ProductCache } from '../cache/product-cache';
import { createLogger } from '../common/logger';
import { OrderLine } from '../domain/order.entity';
import { ScenarioEngine } from '../scenarios/scenario.engine';
import {
  HOT_SKUS,
  OVERSELL_CACHE_ONHAND,
  OVERSELL_LEDGER_FLOOR_MAX,
  OVERSELL_LEDGER_FLOOR_MIN,
  OVERSELL_RESTORE_ONHAND,
  OVERSELL_SYNC_MS,
} from './oversell-config';
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
export class InventoryService implements OnApplicationBootstrap {
  private oversellActive = false;

  constructor(
    private readonly engine: ScenarioEngine,
    private readonly cache: ProductCache,
    private readonly ledger: StockLedger,
  ) {}

  onApplicationBootstrap(): void {
    // While inventory-oversell runs, hold the hot SKUs' true stock below the
    // reservation ledger and keep serving an inflated availability figure to
    // the cache the allocation gate reads. The gate clears orders the ledger
    // cannot fulfil, so allocation surfaces real oversells and backorders.
    const timer = setInterval(() => this.syncOversellState(), OVERSELL_SYNC_MS);
    timer.unref?.();
  }

  private syncOversellState(): void {
    const active = this.engine.isActive('inventory-oversell');
    if (active) {
      for (const sku of HOT_SKUS) {
        const floor =
          OVERSELL_LEDGER_FLOOR_MIN +
          Math.floor(Math.random() * (OVERSELL_LEDGER_FLOOR_MAX - OVERSELL_LEDGER_FLOOR_MIN + 1));
        this.ledger.set(sku, floor);
        this.cache.set(`stock:${sku}`, { onHand: OVERSELL_CACHE_ONHAND, cachedAt: Date.now() });
      }
      this.oversellActive = true;
      return;
    }
    if (this.oversellActive) {
      // Scenario ended: replenish the hot SKUs back to a healthy level.
      for (const sku of HOT_SKUS) {
        this.ledger.set(sku, OVERSELL_RESTORE_ONHAND);
      }
      this.oversellActive = false;
      log.info(
        { event: 'stock_replenished', skus: HOT_SKUS, onHand: OVERSELL_RESTORE_ONHAND },
        `Hot SKUs replenished to ${OVERSELL_RESTORE_ONHAND} after inventory-oversell ended`,
      );
    }
  }

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
