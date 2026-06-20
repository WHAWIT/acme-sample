import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { CatalogService } from '../catalog/catalog.service';
import { ScenarioEngine } from '../scenarios/scenario.engine';
import { createLogger } from '../common/logger';
import { simConfig } from './sim-config';
import { Rng } from './rng';
import { CUSTOMER_PROFILES } from './customer-profiles';

const log = createLogger('storefront-web');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Read-heavy storefront traffic replayed against our own HTTP surface.
 * Per-request logging is owned by the HTTP interceptor; this service only
 * emits a DEBUG heartbeat per tick and must never take the process down.
 */
@Injectable()
export class SelfTrafficService implements OnApplicationBootstrap {
  private readonly rng = new Rng(Number(process.env.SIM_SEED || 0x5eed1) ^ 0x1f83d9ab);
  private readonly baseUrl = `http://127.0.0.1:${process.env.PORT || 8080}`;
  private readonly zeroOrderCustomers = CUSTOMER_PROFILES.filter((c) => c.zeroOrders);
  private timer: NodeJS.Timeout;

  constructor(
    private readonly catalog: CatalogService,
    private readonly engine: ScenarioEngine,
  ) {}

  onApplicationBootstrap(): void {
    // Give the HTTP listener a moment to bind before the first request.
    const warmup = setTimeout(() => this.schedule(), 5_000);
    warmup.unref?.();
    log.info(
      { event: 'traffic_generator_started', ratePerMin: simConfig.queryRatePerMin, baseUrl: this.baseUrl },
      `Storefront traffic generator started (${simConfig.queryRatePerMin}/min)`,
    );
  }

  private schedule(): void {
    const base = 60_000 / Math.max(simConfig.queryRatePerMin, 0.1);
    const interval = base * (1 + (Math.random() * 0.8 - 0.4));
    this.timer = setTimeout(() => {
      this.tick().catch((err) => log.debug({ event: 'traffic_tick_failed', err }, 'Traffic tick failed'));
      this.schedule();
    }, interval);
    this.timer.unref?.();
  }

  private async tick(): Promise<void> {
    const requests: Promise<void>[] = [];

    if (simConfig.baselineNoise) {
      requests.push(this.weightedRequest());
    }

    const factor = this.engine.factor('db-pool-exhaustion');
    if (factor > 0 && this.zeroOrderCustomers.length > 0) {
      const burst = 15 * factor;
      for (let i = 0; i < burst; i++) {
        const customer = this.rng.pick(this.zeroOrderCustomers);
        requests.push(
          sleep(this.rng.int(0, 150)).then(() =>
            this.get(`/api/orders?customerId=${customer.id}`),
          ),
        );
      }
    }

    await Promise.allSettled(requests);
    log.debug({ event: 'traffic_tick', requests: requests.length }, `Storefront traffic tick (${requests.length} requests)`);
  }

  private weightedRequest(): Promise<void> {
    const roll = this.rng.next();

    if (roll < 0.42) {
      const path = this.rng.chance(0.02) ? '/api/products?category=nonexistent' : '/api/products';
      return this.get(path);
    }
    if (roll < 0.72) {
      const customer = this.rng.pick(this.activeCustomers);
      return this.get(`/api/orders?customerId=${customer.id}`);
    }
    if (roll < 0.75) {
      return this.get(`/api/orders/${this.staleOrderId()}`);
    }
    if (roll < 0.85) {
      return this.postQuote();
    }
    if (roll < 0.87) {
      return this.get(`/api/orders/${this.staleOrderId()}/tracking`);
    }
    if (roll < 0.95) {
      const customer = this.rng.pick(this.activeCustomers);
      return this.get(`/api/orders?customerId=${customer.id}&state=DELIVERED`);
    }
    return this.get('/api/reports/daily');
  }

  /** Customers that actually shop; dormant accounts only show up in batch jobs. */
  private get activeCustomers() {
    return CUSTOMER_PROFILES.filter((c) => !c.zeroOrders);
  }

  /** Order ids from stale bookmarks / expired sessions; they never resolve. */
  private staleOrderId(): string {
    return `ord_zz${this.rng.int(100000, 999999)}`;
  }

  private postQuote(): Promise<void> {
    const products: any[] = this.catalog.listProducts();
    if (!products || products.length === 0) return Promise.resolve();
    const lines = [];
    const lineCount = this.rng.int(1, 2);
    for (let i = 0; i < lineCount; i++) {
      const product = this.rng.pick(products);
      lines.push({ sku: product.sku, quantity: this.rng.int(1, 3), unitPrice: Number(product.unitPrice ?? product.price) });
    }
    return this.request('POST', '/api/checkout/quote', { lines });
  }

  private get(path: string): Promise<void> {
    return this.request('GET', path);
  }

  private async request(method: string, path: string, body?: unknown): Promise<void> {
    try {
      const res = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: body ? { 'content-type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      // Drain the body so sockets are released promptly.
      await res.text();
    } catch {
      // Connection errors during startup or deploy churn are expected here.
    }
  }
}
