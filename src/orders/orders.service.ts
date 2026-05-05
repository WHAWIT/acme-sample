import {
  BadRequestException,
  GatewayTimeoutException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createLogger } from '../common/logger';
import { newOrderId } from '../common/ids';
import { FailureCode, OrderProcessingError } from '../domain/failure-codes';
import { Order, OrderState, TERMINAL_STATES } from '../domain/order.entity';
import { CatalogService } from '../catalog/catalog.service';
import { PricingService } from '../pricing/pricing.service';
import { InventoryService } from '../inventory/inventory.service';
import { IdempotencyStore } from './idempotency.store';
import { OrderRepository } from './order.repository';
import { OrderPipelineService } from './order-pipeline.service';

const log = createLogger('order-service');

const QUOTE_AVAILABILITY_TIMEOUT_MS = 5_000;
const DELIVERY_ETA_MS = 72 * 60 * 60 * 1_000;
const DEFAULT_LIST_LIMIT = 50;

export interface CreateOrderDto {
  customerId: string;
  customerName?: string;
  b2b?: boolean;
  lines: Array<{ sku: string; quantity: number }>;
  promoCode?: string;
  shippingAddress?: { street: string; city: string; country: string; zip: string };
  warehouse?: string;
  currency?: string;
}

@Injectable()
export class OrdersService {
  constructor(
    private readonly repository: OrderRepository,
    private readonly idempotencyStore: IdempotencyStore,
    private readonly pipeline: OrderPipelineService,
    private readonly catalog: CatalogService,
    private readonly pricing: PricingService,
    private readonly inventory: InventoryService,
  ) {}

  async createOrder(dto: CreateOrderDto, idempotencyKey?: string): Promise<Order> {
    const order = this.buildOrder(dto);
    order.idempotencyKey = idempotencyKey;
    log.info(
      {
        event: 'order_received',
        orderId: order.id,
        customerId: order.customerId,
        lineCount: order.lines.length,
        promoCode: order.promoCode,
        idempotencyKey,
      },
      `Order ${order.id} received from ${order.customerId}`,
    );

    if (idempotencyKey) {
      const claimed = await this.idempotencyStore.claim(idempotencyKey, order.id);
      if (!claimed) {
        const existingId = this.idempotencyStore.getOrderId(idempotencyKey);
        const existing = existingId ? await this.repository.findById(existingId) : undefined;
        if (existing) {
          log.info(
            {
              event: 'order_deduplicated',
              orderId: existing.id,
              customerId: existing.customerId,
              idempotencyKey,
            },
            `Idempotency key ${idempotencyKey} already claimed by order ${existing.id}; returning existing order`,
          );
          return existing;
        }
      }
    }

    this.repository.save(order);
    if (idempotencyKey) {
      await this.reconcileIdempotency(order, idempotencyKey);
    }
    this.pipeline.submit(order);
    return order;
  }

  async getOrder(id: string): Promise<Order> {
    const order = await this.repository.findById(id);
    if (!order) {
      throw new NotFoundException(`Order ${id} not found`);
    }
    return order;
  }

  async listOrders(query: { customerId?: string; state?: string; limit?: number }): Promise<Order[]> {
    if (!query.customerId) {
      throw new BadRequestException('customerId is required');
    }
    const orders = await this.repository.findByCustomer(query.customerId, query.state);
    const limit = query.limit && query.limit > 0 ? query.limit : DEFAULT_LIST_LIMIT;
    return orders.slice(0, limit);
  }

  async quote(dto: CreateOrderDto): Promise<{ subtotal: number; total: number; availability: any }> {
    const started = Date.now();
    const draft = this.buildOrder(dto);
    let priced: { subtotal: number; total: number };
    try {
      priced = await this.pricing.price(draft);
    } catch (err) {
      if (err instanceof OrderProcessingError && err.code === FailureCode.PromoExpired) {
        throw new BadRequestException(`Promo code ${dto.promoCode} has expired`);
      }
      throw err;
    }
    const availability = await this.checkAvailabilityWithTimeout(draft);
    log.info(
      {
        event: 'checkout_quote',
        customerId: dto.customerId,
        subtotal: priced.subtotal,
        amount: priced.total,
        lineCount: draft.lines.length,
        latencyMs: Date.now() - started,
      },
      `Checkout quote computed for ${dto.customerId}`,
    );
    return { subtotal: priced.subtotal, total: priced.total, availability };
  }

  async tracking(id: string): Promise<{
    orderId: string;
    state: OrderState;
    history: Order['history'];
    eta?: Date;
  }> {
    const order = await this.getOrder(id);
    const inTransit = !TERMINAL_STATES.has(order.state) && order.state !== OrderState.Failed;
    return {
      orderId: order.id,
      state: order.state,
      history: order.history,
      eta: inTransit ? new Date(order.createdAt.getTime() + DELIVERY_ETA_MS) : undefined,
    };
  }

  activeCount(): number {
    return this.repository.activeCount();
  }

  private buildOrder(dto: CreateOrderDto): Order {
    const now = new Date();
    return {
      id: newOrderId(),
      customerId: dto.customerId,
      customerName: dto.customerName || 'Guest Customer',
      b2b: !!dto.b2b,
      lines: (dto.lines || []).map((line) => ({
        sku: line.sku,
        quantity: line.quantity,
        unitPrice: this.catalog.getProduct(line.sku)?.unitPrice ?? 0,
      })),
      currency: dto.currency || 'USD',
      promoCode: dto.promoCode,
      shippingAddress:
        dto.shippingAddress || { street: '548 Market St', city: 'San Francisco', country: 'US', zip: '94104' },
      warehouse: dto.warehouse || 'us-east-1',
      state: OrderState.Received,
      paymentAttempts: 0,
      allocationAttempts: 0,
      createdAt: now,
      updatedAt: now,
      history: [],
    };
  }

  /**
   * Post-write consistency check: the idempotency claim and the order write
   * are separate operations, so verify no sibling order slipped in with the
   * same key.
   */
  private async reconcileIdempotency(order: Order, key: string): Promise<void> {
    const siblings = await this.repository.findByCustomer(order.customerId);
    const duplicate = siblings.find((o) => o.id !== order.id && o.idempotencyKey === key);
    if (duplicate) {
      const [first, second] = [duplicate.id, order.id].sort();
      log.error(
        {
          event: 'duplicate_order_detected',
          errorCode: FailureCode.DuplicateOrder,
          orderId: order.id,
          duplicateOrderId: duplicate.id,
          customerId: order.customerId,
          idempotencyKey: key,
        },
        `orders ${first} and ${second} share idempotency key ${key}`,
      );
    }
  }

  private async checkAvailabilityWithTimeout(order: Order): Promise<any> {
    let timer: NodeJS.Timeout;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () =>
          reject(
            new OrderProcessingError(FailureCode.UpstreamTimeout, 'inventory availability check timed out', true),
          ),
        QUOTE_AVAILABILITY_TIMEOUT_MS,
      );
    });
    try {
      return await Promise.race([this.inventory.checkAvailability(order.lines), timeout]);
    } catch (err) {
      if (err instanceof OrderProcessingError && err.code === FailureCode.UpstreamTimeout) {
        log.error(
          {
            event: 'checkout_quote_timeout',
            errorCode: FailureCode.UpstreamTimeout,
            customerId: order.customerId,
            latencyMs: QUOTE_AVAILABILITY_TIMEOUT_MS,
            err,
          },
          'Availability check timed out during checkout quote',
        );
        throw new GatewayTimeoutException('Inventory availability check timed out');
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }
}
