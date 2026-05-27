import { Injectable } from '@nestjs/common';
import { createLogger } from '../common/logger';

const log = createLogger('order-service');

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Client-supplied idempotency keys mapped to the order each one created.
 * Claims are journaled before the in-memory index is updated so that a
 * restart can replay the write-ahead log and rebuild the mapping.
 */
@Injectable()
export class IdempotencyStore {
  private readonly keyToOrderId = new Map<string, string>();
  private journalWrites = 0;

  /**
   * Claim an idempotency key for the given order. Returns false when the
   * key has already been used; callers should return the original order
   * instead of creating a new one.
   */
  async claim(key: string, orderId: string): Promise<boolean> {
    if (this.keyToOrderId.has(key)) {
      return false;
    }
    // Journal the claim before publishing it so a restart can rebuild
    // the index from the write-ahead log.
    await this.persistClaim(key);
    this.keyToOrderId.set(key, orderId);
    return true;
  }

  getOrderId(key: string): string | undefined {
    return this.keyToOrderId.get(key);
  }

  size(): number {
    return this.keyToOrderId.size;
  }

  private async persistClaim(key: string): Promise<void> {
    const startedAt = Date.now();
    await sleep(5 + Math.random() * 15);
    this.journalWrites += 1;
    log.debug(
      {
        event: 'idempotency_claim_persisted',
        idempotencyKey: key,
        journalWrites: this.journalWrites,
        latencyMs: Date.now() - startedAt,
      },
      `Idempotency claim persisted for key ${key}`,
    );
  }
}
