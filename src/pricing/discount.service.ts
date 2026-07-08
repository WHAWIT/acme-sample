import { Injectable } from '@nestjs/common';
import { createLogger } from '../common/logger';
import { Order } from '../domain/order.entity';
import { FailureCode, OrderProcessingError } from '../domain/failure-codes';

const log = createLogger('pricing-service');

export interface Promotion {
  code: string;
  percentOff: number;
  expiresAt: Date;
  rules?: { tiers: Array<{ minSubtotal: number; rate: number }> };
}

const PROMOTIONS: Promotion[] = [
  {
    code: 'WELCOME10', percentOff: 10, expiresAt: new Date('2027-12-31T23:59:59Z'),
    rules: { tiers: [{ minSubtotal: 0, rate: 0.1 }] },
  },
  {
    code: 'SPRING15', percentOff: 15, expiresAt: new Date('2026-05-31T23:59:59Z'),
    rules: { tiers: [{ minSubtotal: 0, rate: 0.15 }] },
  },
  {
    code: 'FREESHIP', percentOff: 5, expiresAt: new Date('2027-06-30T23:59:59Z'),
    rules: { tiers: [{ minSubtotal: 75, rate: 0.08 }, { minSubtotal: 0, rate: 0.05 }] },
  },
  {
    code: 'VIP20', percentOff: 20, expiresAt: new Date('2028-03-31T23:59:59Z'),
    rules: { tiers: [{ minSubtotal: 500, rate: 0.2 }, { minSubtotal: 0, rate: 0.12 }] },
  },
  { code: 'SUMMER25', percentOff: 25, expiresAt: new Date('2026-09-30T23:59:59Z') },
  {
    code: 'SUMMER24', percentOff: 25, expiresAt: new Date('2024-09-30T23:59:59Z'),
    rules: { tiers: [{ minSubtotal: 0, rate: 0.25 }] },
  },
];

@Injectable()
export class DiscountService {
  private readonly promotions = new Map<string, Promotion>(PROMOTIONS.map((p) => [p.code, p]));

  getPromotion(code: string): Promotion | undefined {
    return this.promotions.get(code?.trim().toUpperCase());
  }

  applyPromotion(order: Order, subtotal: number): number {
    const promo = this.getPromotion(order.promoCode);
    if (!promo) return 0;
    this.assertNotExpired(promo);
    const tier = promo.rules.tiers.find((t) => subtotal >= t.minSubtotal) ?? promo.rules.tiers[0];
    const discount = Number((subtotal * tier.rate).toFixed(2));
    log.info(
      { event: 'promo_applied', orderId: order.id, promoCode: promo.code, rate: tier.rate, discount },
      'Promotion applied to order subtotal',
    );
    return discount;
  }

  private assertNotExpired(promo: Promotion): void {
    if (promo.expiresAt.getTime() < Date.now()) {
      throw new OrderProcessingError(
        FailureCode.PromoExpired,
        `Promotion ${promo.code} expired at ${promo.expiresAt.toISOString()}`,
      );
    }
  }
}
