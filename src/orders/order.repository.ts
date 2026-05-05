import { Injectable } from '@nestjs/common';
import { Order, TERMINAL_STATES } from '../domain/order.entity';
import { DbPool } from '../infra/db-pool';

/**
 * Order persistence. Record fetches are served through the shared
 * connection pool; aggregate counters read the in-memory index directly
 * so dashboards stay cheap.
 */
@Injectable()
export class OrderRepository {
  private readonly byId = new Map<string, Order>();
  private readonly byCustomer = new Map<string, Set<string>>();

  constructor(private readonly db: DbPool) {}

  async findById(id: string): Promise<Order | undefined> {
    const rows = await this.db.runQuery('SELECT * FROM orders WHERE id = $1', [id], () =>
      this.byId.has(id) ? [this.byId.get(id)] : [],
    );
    return rows[0];
  }

  async findByCustomer(customerId: string, state?: string): Promise<Order[]> {
    const sql = state
      ? 'SELECT * FROM orders WHERE customer_id = $1 AND state = $2 ORDER BY created_at DESC'
      : 'SELECT * FROM orders WHERE customer_id = $1 ORDER BY created_at DESC';
    const params = state ? [customerId, state] : [customerId];
    return this.db.runQuery(sql, params, () => {
      const ids = this.byCustomer.get(customerId);
      if (!ids || ids.size === 0) {
        return [];
      }
      const orders: Order[] = [];
      for (const id of ids) {
        const order = this.byId.get(id);
        if (order && (!state || order.state === state)) {
          orders.push(order);
        }
      }
      return orders.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    });
  }

  save(order: Order): void {
    this.byId.set(order.id, order);
    let ids = this.byCustomer.get(order.customerId);
    if (!ids) {
      ids = new Set<string>();
      this.byCustomer.set(order.customerId, ids);
    }
    ids.add(order.id);
  }

  activeCount(): number {
    let count = 0;
    for (const order of this.byId.values()) {
      if (!TERMINAL_STATES.has(order.state)) count += 1;
    }
    return count;
  }

  countsByState(): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const order of this.byId.values()) {
      counts[order.state] = (counts[order.state] || 0) + 1;
    }
    return counts;
  }

  totalToday(): number {
    const dayStart = new Date();
    dayStart.setHours(0, 0, 0, 0);
    let count = 0;
    for (const order of this.byId.values()) {
      if (order.createdAt >= dayStart) count += 1;
    }
    return count;
  }
}
