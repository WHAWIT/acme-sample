import { Injectable } from '@nestjs/common';
import { ProductCache } from '../cache/product-cache';
import { createLogger } from '../common/logger';
import { FailureCode, OrderProcessingError } from '../domain/failure-codes';
import { Order } from '../domain/order.entity';

const log = createLogger('inventory-service');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Authoritative on-hand counts per SKU. Quantities are seeded lazily so
 * every SKU the catalog produces starts with a plausible stock level.
 */
@Injectable()
export class StockLedger {
  private readonly stock = new Map<string, number>();

  onHand(sku: string): number {
    if (!this.stock.has(sku)) {
      this.stock.set(sku, this.seedQuantity(sku));
    }
    return this.stock.get(sku);
  }

  set(sku: string, quantity: number): void {
    this.stock.set(sku, quantity);
  }

  private seedQuantity(sku: string): number {
    const prefix = sku.split('-')[0] || sku;
    let h = 2166136261;
    for (const ch of prefix + sku) {
      h ^= ch.charCodeAt(0);
      h = Math.imul(h, 16777619);
    }
    return 50 + ((h >>> 0) % 451);
  }
}

@Injectable()
export class StockAllocator {
  constructor(
    private readonly ledger: StockLedger,
    private readonly cache: ProductCache,
  ) {}

  async allocate(order: Order): Promise<void> {
    await sleep(20 + Math.random() * 60);

    // Availability gate: prefer the cached stock view to keep allocation
    // off the ledger's hot path; the ledger remains the source of truth
    // for the actual deduction below.
    for (const line of order.lines) {
      const cached = this.cache.get(`stock:${line.sku}`);
      const visible = cached ? cached.onHand : this.ledger.onHand(line.sku);
      if (visible < line.quantity) {
        throw new OrderProcessingError(
          FailureCode.InsufficientStock,
          `Insufficient stock for ${line.sku}: requested ${line.quantity}, on hand ${visible}`,
          order.allocationAttempts < 3,
        );
      }
    }

    for (const line of order.lines) {
      const onHand = this.ledger.onHand(line.sku);
      const remaining = onHand - line.quantity;
      if (remaining < 0) {
        this.ledger.set(line.sku, 0);
        log.warn(
          {
            event: 'oversell_detected',
            errorCode: FailureCode.Oversell,
            orderId: order.id,
            sku: line.sku,
            requested: line.quantity,
            onHand,
          },
          `allocated ${line.quantity} units of ${line.sku}, on-hand ${onHand}`,
        );
        const shortfall = line.quantity - onHand;
        log.error(
          {
            event: 'fulfillment_shortfall',
            errorCode: FailureCode.InsufficientStock,
            orderId: order.id,
            sku: line.sku,
            shortfall,
            err: new OrderProcessingError(
              FailureCode.InsufficientStock,
              `Cannot fulfill ${shortfall} units of ${line.sku} for order ${order.id}`,
            ),
          },
          `Fulfillment shortfall of ${shortfall} units for ${line.sku} on order ${order.id}`,
        );
      } else {
        this.ledger.set(line.sku, remaining);
      }
    }

    log.info(
      { event: 'stock_allocated', orderId: order.id, skus: order.lines.map((l) => l.sku) },
      `Allocated stock for order ${order.id} (${order.lines.length} lines)`,
    );
  }
}
