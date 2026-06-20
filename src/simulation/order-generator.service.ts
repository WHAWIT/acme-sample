import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { OrdersService } from '../orders/orders.service';
import { CatalogService } from '../catalog/catalog.service';
import { ScenarioEngine } from '../scenarios/scenario.engine';
import { createLogger } from '../common/logger';
import { simConfig } from './sim-config';
import { Rng } from './rng';
import { CUSTOMER_PROFILES, CustomerProfile, NEW_PROMO, PROMO_CODES } from './customer-profiles';

const log = createLogger('order-intake');

const HOSTILE_UNIT_PRICES = [19.99, 39.99, 7.77];
const DRIFT_QUANTITIES = [3, 6, 7, 9, 11, 13];

/**
 * Synthetic storefront order stream. Emits orders into the real pipeline at
 * simConfig.orderRatePerMin with Poisson-like jitter; the pipeline itself
 * produces all interesting logs, so ticks here stay at DEBUG.
 */
@Injectable()
export class OrderGeneratorService implements OnApplicationBootstrap {
  private readonly rng = new Rng(Number(process.env.SIM_SEED || 0x5eed1) ^ 0x9e3779b9);
  private readonly buyers: CustomerProfile[] = CUSTOMER_PROFILES.filter((c) => !c.zeroOrders);
  private timer: NodeJS.Timeout;
  private generatedToday = 0;
  private counterDate = new Date().toISOString().slice(0, 10);

  constructor(
    private readonly orders: OrdersService,
    private readonly catalog: CatalogService,
    private readonly engine: ScenarioEngine,
  ) {}

  onApplicationBootstrap(): void {
    this.schedule();
    log.info(
      { event: 'order_generator_started', ratePerMin: simConfig.orderRatePerMin },
      `Order intake generator started (${simConfig.orderRatePerMin}/min)`,
    );
  }

  /** Orders emitted since UTC midnight; consumed by the metrics snapshot. */
  ordersToday(): number {
    this.rollCounterDate();
    return this.generatedToday;
  }

  private rollCounterDate(): void {
    const today = new Date().toISOString().slice(0, 10);
    if (today !== this.counterDate) {
      this.counterDate = today;
      this.generatedToday = 0;
    }
  }

  private schedule(): void {
    const base = 60_000 / Math.max(simConfig.orderRatePerMin, 0.1);
    const interval = base * (1 + (Math.random() * 0.8 - 0.4));
    this.timer = setTimeout(() => {
      this.tick().catch((err) => log.debug({ event: 'order_tick_failed', err }, 'Order tick failed'));
      this.schedule();
    }, interval);
    this.timer.unref?.();
  }

  private async tick(): Promise<void> {
    this.rollCounterDate();
    const dto = this.buildOrderDto();
    if (!dto) return;

    if (this.engine.isActive('duplicate-order-storm')) {
      // Impatient client: fires retries without waiting for the first
      // response, all carrying the same idempotency key.
      const idempotencyKey = `idem_${Math.random().toString(36).slice(2, 12)}`;
      await Promise.allSettled([
        this.orders.createOrder(dto, idempotencyKey),
        this.orders.createOrder(dto, idempotencyKey),
        this.orders.createOrder(dto, idempotencyKey),
      ]);
      this.generatedToday++;
      log.debug(
        { event: 'order_tick', customerId: dto.customerId, idempotencyKey, concurrentRetries: 3 },
        'Storefront fired concurrent retries with shared idempotency key',
      );
      return;
    }

    const idempotencyKey = this.rng.chance(0.1)
      ? `idem_${Math.random().toString(36).slice(2, 12)}`
      : undefined;

    try {
      const order = await this.orders.createOrder(dto, idempotencyKey);
      this.generatedToday++;
      log.debug(
        { event: 'order_tick', orderId: order?.id, customerId: dto.customerId, lineCount: dto.lines.length, promoCode: dto.promoCode },
        'Storefront order submitted',
      );
    } catch (err) {
      // Business rejections are logged in full by the pipeline itself.
      log.debug({ event: 'order_tick_rejected', customerId: dto.customerId, err }, 'Storefront order rejected');
    }
  }

  private buildOrderDto() {
    const products: any[] = this.catalog.listProducts();
    if (!products || products.length === 0) return undefined;

    const customer = this.rng.pick(this.buyers);
    const mismatchSpike = this.engine.isActive('payment-mismatch-spike');

    const lines = [];
    const lineCount = this.rng.int(1, 4);
    for (let i = 0; i < lineCount; i++) {
      const product = this.rng.pick(products);
      let unitPrice = Number(product.unitPrice ?? product.price);
      let quantity = customer.b2b && this.rng.chance(0.35) ? this.rng.int(5, 20) : this.rng.int(1, 3);
      if (mismatchSpike) {
        unitPrice = this.rng.pick(HOSTILE_UNIT_PRICES);
        quantity = this.rng.pick(DRIFT_QUANTITIES);
      }
      lines.push({ sku: product.sku, quantity, unitPrice });
    }

    if (this.rng.chance(0.008)) {
      // Legacy storefront clients still send decomposed-unicode / retired SKUs.
      lines[0].sku = this.rng.chance(0.5) ? 'PEÑ-SET-01'.normalize('NFD') : 'XXX-BAD-99';
    }

    let promoCode: string | undefined;
    if (this.engine.isActive('bad-deploy-npe') && this.rng.chance(0.4)) {
      promoCode = NEW_PROMO;
    } else if (this.rng.chance(0.08)) {
      promoCode = this.rng.pick(PROMO_CODES);
    }

    return {
      customerId: customer.id,
      customerName: customer.name,
      b2b: customer.b2b,
      currency: customer.country === 'US' ? 'USD' : customer.country === 'GB' ? 'GBP' : 'EUR',
      lines,
      promoCode,
      shippingAddress: {
        street: customer.street,
        city: customer.city,
        country: customer.country,
        zip: customer.zip,
      },
      warehouse: customer.warehouse,
    };
  }
}
