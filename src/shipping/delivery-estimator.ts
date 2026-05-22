import { Injectable } from '@nestjs/common';
import { createLogger } from '../common/logger';
import { FailureCode } from '../domain/failure-codes';
import { Order } from '../domain/order.entity';

const log = createLogger('shipping-service');

interface Warehouse {
  code: string;
  tz: string;
  cutoff: string;
}

const WAREHOUSES: Record<string, Warehouse> = {
  'US-EAST-1': { code: 'US-EAST-1', tz: 'America/New_York', cutoff: '17:00' },
  'US-WEST-2': { code: 'US-WEST-2', tz: 'America/Los_Angeles', cutoff: '17:00' },
  'EU-CENTRAL-1': { code: 'EU-CENTRAL-1', tz: 'Europe/Berlin', cutoff: '17:00' },
};

const DAY_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class DeliveryEstimator {
  /**
   * Delivery promise anchored to the warehouse dispatch cutoff: orders
   * confirmed before the cutoff leave the same day, otherwise the next.
   */
  estimateDelivery(order: Order): Date {
    const wh = WAREHOUSES[order.warehouse] ?? WAREHOUSES['US-EAST-1'];
    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const transitDays = this.transitDays(order, wh);
    const cutoff = new Date(`${today}T${wh.cutoff}:00Z`);
    let eta = new Date(cutoff.getTime() + transitDays * DAY_MS);
    if (!this.beforeCutoff(now, wh)) {
      eta = new Date(eta.getTime() + DAY_MS);
    }
    if (eta.getTime() < now.getTime()) {
      log.warn(
        {
          event: 'delivery_estimate_invalid',
          errorCode: FailureCode.PastDeliveryDate,
          orderId: order.id,
          estimate: eta.toISOString(),
          warehouse: wh.code,
        },
        `computed delivery estimate ${eta.toISOString().slice(0, 10)} is in the past for order ${order.id}`,
      );
      eta = new Date(now.getTime() + 3 * DAY_MS);
    }
    return eta;
  }

  /** Same-day courier for single-unit domestic orders; ground otherwise. */
  private transitDays(order: Order, wh: Warehouse): number {
    const dest = order.shippingAddress?.country ?? 'US';
    const domestic =
      (wh.code.startsWith('US') && dest === 'US') ||
      (wh.code === 'EU-CENTRAL-1' && ['DE', 'FR', 'NL', 'AT', 'PL'].includes(dest));
    if (!domestic) return 4;
    const units = order.lines.reduce((n, l) => n + l.quantity, 0);
    return units === 1 ? 0 : 2;
  }

  private beforeCutoff(now: Date, wh: Warehouse): boolean {
    const local = new Intl.DateTimeFormat('en-GB', {
      timeZone: wh.tz,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(now);
    return local < wh.cutoff;
  }
}
