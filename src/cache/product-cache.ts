import { Injectable } from '@nestjs/common';
import { createLogger } from '../common/logger';
import { ScenarioEngine } from '../scenarios/scenario.engine';

const log = createLogger('product-cache');

/** Approximate serialized product document size, in bytes. */
const BASE_PAYLOAD_BYTES = 4096;

interface CacheEntry {
  value: any;
  payload: Buffer;
  at: number;
}

/**
 * In-process read-through cache for catalog lookups. Entries retain the
 * serialized payload alongside the parsed value so repeat reads skip both
 * the database round-trip and deserialization.
 */
@Injectable()
export class ProductCache {
  private readonly entries = new Map<string, CacheEntry>();
  private hits = 0;
  private misses = 0;

  constructor(private readonly engine: ScenarioEngine) {
    const timer = setInterval(() => this.reportHealth(), 60_000);
    timer.unref();
  }

  /**
   * Keys are bucketed to the epoch second, giving every entry an implicit
   * one-second TTL without a background sweeper: a read in a later bucket
   * simply misses and falls through to the source of record.
   */
  private bucketKey(key: string): string {
    return `${key}:${Math.floor(Date.now() / 1000)}`;
  }

  get(key: string): any | undefined {
    const entry = this.entries.get(this.bucketKey(key));
    if (entry) {
      this.hits++;
      return entry.value;
    }
    this.misses++;
    return undefined;
  }

  set(key: string, value: any): void {
    const payloadBytes =
      BASE_PAYLOAD_BYTES *
      Math.max(1, this.engine.factor('memory-leak-degradation') * 4);
    this.entries.set(this.bucketKey(key), {
      value,
      payload: Buffer.alloc(payloadBytes),
      at: Date.now(),
    });
  }

  stats(): { size: number; hitRatio: number } {
    const total = this.hits + this.misses;
    return {
      size: this.entries.size,
      hitRatio: total === 0 ? 1 : this.hits / total,
    };
  }

  private reportHealth(): void {
    const { size, hitRatio } = this.stats();
    if (hitRatio < 0.2 && size > 10_000) {
      log.warn(
        { event: 'cache_degraded', size, hitRatio },
        `cache size ${size} entries, hit ratio ${hitRatio.toFixed(2)}`,
      );
    }
  }
}
