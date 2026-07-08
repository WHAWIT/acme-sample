import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { OrdersService } from '../orders/orders.service';
import { CatalogService } from '../catalog/catalog.service';
import { ScenarioEngine } from '../scenarios/scenario.engine';
import { ScenarioName } from '../scenarios/scenario.types';
import {
  BAD_MOBILE_VERSION,
  API_CLIENT_VERSION,
  CARD_BINS,
  CHANNEL_WEIGHTS,
  CONCENTRATION_CAP,
  EXPIRED_PROMO,
  INSUFFICIENT_FUNDS_BIN,
  INSUFFICIENT_FUNDS_ISSUER,
  MOBILE_BASELINE_VERSIONS,
  RATE_BLOCKED_CUSTOMER_BASELINE,
  RATE_CHECKOUT_MISSING_FIELD,
  RATE_EXPIRED_PROMO_WEB,
  RATE_INSUFFICIENT_FUNDS,
  RATE_MISSING_ZIP_BASELINE,
  RATE_OVERSELL_CONCENTRATION,
  WEB_APP_VERSION,
} from '../scenarios/scenario-inputs';
import {
  HOT_SKUS,
  OVERSELL_ORDER_QTY_MAX,
  OVERSELL_ORDER_QTY_MIN,
} from '../inventory/oversell-config';
import { BLACKLISTED_CUSTOMERS } from '../domain/customer-blacklist';
import { OrderChannel } from '../domain/order.entity';
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

    if (this.engine.isActive('blocked-customer-retry-storm')) {
      // A single blocked account hammers checkout, retrying in tight bursts.
      const blocked = BLACKLISTED_CUSTOMERS[0];
      const burst = 3 * Math.max(1, this.engine.factor('blocked-customer-retry-storm'));
      const stormDto = {
        ...dto,
        customerId: blocked.id,
        customerName: blocked.name,
        // Keep a zip so the rejection is the block, not a missing field.
        shippingAddress: { ...dto.shippingAddress, zip: dto.shippingAddress.zip ?? '10001' },
      };
      await Promise.allSettled(
        Array.from({ length: burst }, () => this.orders.createOrder(stormDto)),
      );
      this.generatedToday += burst;
      log.debug(
        { event: 'order_tick', customerId: blocked.id, blockedRetryBurst: burst },
        'Blocked customer fired a retry burst',
      );
      // Fall through: the blocked-customer burst is additive to the baseline
      // order below, so successful traffic continues during the scenario
      // instead of the window reading as a total outage.
    }

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

    // --- Correlation dimensions ---
    let channel = this.pickChannel();
    let appVersion = this.appVersionFor(channel);
    const card = this.rng.pick(CARD_BINS);
    let cardBin = card.bin;
    let issuer = card.issuer;

    // Baseline drip of malformed checkouts, plus the regressed mobile build.
    let dropZip = this.rng.chance(RATE_MISSING_ZIP_BASELINE);
    if (this.rng.chance(this.scaledRate('checkout-missing-field', RATE_CHECKOUT_MISSING_FIELD))) {
      channel = 'mobile';
      appVersion = BAD_MOBILE_VERSION;
      dropZip = true;
    }

    // Insufficient-funds wave concentrates one BIN/issuer.
    if (this.rng.chance(this.scaledRate('insufficient-funds-wave', RATE_INSUFFICIENT_FUNDS))) {
      cardBin = INSUFFICIENT_FUNDS_BIN;
      issuer = INSUFFICIENT_FUNDS_ISSUER;
    }

    // --- Lines ---
    const oversell = this.rng.chance(this.scaledRate('inventory-oversell', RATE_OVERSELL_CONCENTRATION));
    const lines = [];
    const lineCount = oversell ? this.rng.int(1, 2) : this.rng.int(1, 4);
    for (let i = 0; i < lineCount; i++) {
      if (oversell) {
        // Flash-sale demand piles onto a couple of hot SKUs at big quantities.
        lines.push({
          sku: this.rng.pick(HOT_SKUS),
          quantity: this.rng.int(OVERSELL_ORDER_QTY_MIN, OVERSELL_ORDER_QTY_MAX),
          unitPrice: 0,
        });
        continue;
      }
      const product = this.rng.pick(products);
      let unitPrice = Number(product.unitPrice ?? product.price);
      let quantity = customer.b2b && this.rng.chance(0.35) ? this.rng.int(5, 20) : this.rng.int(1, 3);
      if (mismatchSpike) {
        unitPrice = this.rng.pick(HOSTILE_UNIT_PRICES);
        quantity = this.rng.pick(DRIFT_QUANTITIES);
      }
      lines.push({ sku: product.sku, quantity, unitPrice });
    }

    if (!oversell && this.rng.chance(0.008)) {
      // Legacy storefront clients still send decomposed-unicode / retired SKUs.
      lines[0].sku = this.rng.chance(0.5) ? 'PEÑ-SET-01'.normalize('NFD') : 'XXX-BAD-99';
    }

    let promoCode: string | undefined;
    if (this.engine.isActive('bad-deploy-npe') && this.rng.chance(0.4)) {
      promoCode = NEW_PROMO;
    } else if (
      channel === 'web' &&
      this.rng.chance(this.scaledRate('expired-promo-flood', RATE_EXPIRED_PROMO_WEB))
    ) {
      // Stale CDN banner keeps offering last summer's expired code.
      promoCode = EXPIRED_PROMO;
    } else if (this.rng.chance(0.08)) {
      promoCode = this.rng.pick(PROMO_CODES);
    }

    // Baseline drip of orders from chargeback-blocked accounts.
    let customerId = customer.id;
    let customerName = customer.name;
    if (this.rng.chance(RATE_BLOCKED_CUSTOMER_BASELINE)) {
      const blocked = this.rng.pick(BLACKLISTED_CUSTOMERS);
      customerId = blocked.id;
      customerName = blocked.name;
    }

    const shippingAddress = {
      street: customer.street,
      city: customer.city,
      country: customer.country,
      ...(dropZip ? {} : { zip: customer.zip }),
    };

    return {
      customerId,
      customerName,
      b2b: customer.b2b,
      channel,
      appVersion,
      cardBin,
      issuer,
      currency: customer.country === 'US' ? 'USD' : customer.country === 'GB' ? 'GBP' : 'EUR',
      lines,
      promoCode,
      shippingAddress,
      warehouse: customer.warehouse,
    };
  }

  /** Per-tick probability of a scenario's signal, scaled by intensity and capped. */
  private scaledRate(name: ScenarioName, base: number): number {
    const factor = this.engine.factor(name);
    return factor > 0 ? Math.min(base * factor, CONCENTRATION_CAP) : 0;
  }

  private pickChannel(): OrderChannel {
    const roll = this.rng.next();
    let acc = 0;
    for (const [channel, weight] of CHANNEL_WEIGHTS) {
      acc += weight;
      if (roll < acc) return channel;
    }
    return 'web';
  }

  private appVersionFor(channel: OrderChannel): string {
    if (channel === 'mobile') return this.rng.pick(MOBILE_BASELINE_VERSIONS);
    if (channel === 'api') return API_CLIENT_VERSION;
    return WEB_APP_VERSION;
  }
}
