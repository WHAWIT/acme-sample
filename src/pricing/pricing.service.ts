import { Injectable } from '@nestjs/common';
import { createLogger } from '../common/logger';
import { Order } from '../domain/order.entity';
import { DiscountService } from './discount.service';
import { TaxCalculator } from './tax.calculator';

const log = createLogger('pricing-service');

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

@Injectable()
export class PricingService {
  constructor(private readonly discounts: DiscountService) {}

  async price(order: Order): Promise<{ subtotal: number; total: number }> {
    const started = Date.now();
    await sleep(20 + Math.random() * 60);

    let subtotal = Number(
      order.lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0).toFixed(2),
    );

    if (order.promoCode) {
      subtotal = Number((subtotal - this.discounts.applyPromotion(order, subtotal)).toFixed(2));
    }

    const total = TaxCalculator.total(subtotal);

    log.info(
      {
        event: 'order_priced',
        orderId: order.id,
        subtotal,
        total,
        promoCode: order.promoCode,
        latencyMs: Date.now() - started,
      },
      'Order priced',
    );

    return { subtotal, total };
  }
}
