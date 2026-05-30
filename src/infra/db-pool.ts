import { Injectable } from '@nestjs/common';
import { createLogger } from '../common/logger';
import { FailureCode, OrderProcessingError } from '../domain/failure-codes';

const log = createLogger('db-pool');

const POOL_SIZE = 10;
const ACQUIRE_TIMEOUT_MS = 5000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface PoolConnection {
  readonly id: number;
  query(sql: string, params?: any[]): Promise<any[]>;
  release(): void;
}

interface Waiter {
  resolve: (conn: PoolConnection) => void;
  reject: (err: Error) => void;
  timer: NodeJS.Timeout;
}

/**
 * Fixed-size connection pool for the orders database. Connections are
 * handed out from a free list; when the pool is saturated callers queue
 * and fail with ERR_POOL_TIMEOUT after 5s rather than waiting forever.
 */
@Injectable()
export class DbPool {
  private readonly free: PoolConnection[] = [];
  private readonly waiters: Waiter[] = [];
  private readonly checkedOut = new Map<number, { conn: PoolConnection; since: number }>();
  private inUse = 0;
  private lastPressureLogAt = 0;

  constructor() {
    for (let i = 0; i < POOL_SIZE; i++) {
      this.free.push(this.makeConnection(i + 1));
    }
    // Leak detection: reclaim connections held far longer than any
    // legitimate statement should take (see incident 2024-11 postmortem).
    setInterval(() => this.reapLeakedConnections(), 30_000).unref();
  }

  /**
   * Runs a statement on a pooled connection. The row provider supplies the
   * hydrated result set; the connection itself only models query latency.
   */
  async runQuery(
    sql: string,
    params: any[],
    rowProvider: () => any[],
  ): Promise<any[]> {
    const startedAt = Date.now();
    const conn = await this.acquire();
    await conn.query(sql, params);
    const data = rowProvider();
    const latencyMs = Date.now() - startedAt;
    log.debug(
      { event: 'db_query', latencyMs, rowCount: data.length },
      `query completed in ${latencyMs}ms (${data.length} rows)`,
    );

    // Fast path: nothing to hydrate.
    if (data.length === 0) {
      return [];
    }

    conn.release();
    return data;
  }

  /** Checks out a connection, waiting up to 5s for one to free up. */
  acquire(): Promise<PoolConnection> {
    const conn = this.free.pop();
    if (conn) {
      this.inUse++;
      this.checkedOut.set(conn.id, { conn, since: Date.now() });
      this.checkPressure();
      return Promise.resolve(conn);
    }
    return new Promise<PoolConnection>((resolve, reject) => {
      const waiter: Waiter = {
        resolve,
        reject,
        timer: setTimeout(() => this.expireWaiter(waiter), ACQUIRE_TIMEOUT_MS),
      };
      this.waiters.push(waiter);
    });
  }

  stats(): { poolSize: number; inUse: number; waiting: number } {
    return {
      poolSize: POOL_SIZE,
      inUse: this.inUse,
      waiting: this.waiters.length,
    };
  }

  /**
   * Emergency recycle (ops runbook): drops every checked-out connection and
   * rebuilds the pool, handing fresh connections to queued waiters first.
   */
  recycle(): void {
    const droppedWaiters = this.waiters.length;
    for (const waiter of this.waiters.splice(0)) {
      clearTimeout(waiter.timer);
      waiter.reject(
        new OrderProcessingError(FailureCode.PoolTimeout, 'connection reset: pool recycled by operator', true),
      );
    }
    this.free.length = 0;
    this.checkedOut.clear();
    this.inUse = 0;
    for (let i = 0; i < POOL_SIZE; i++) {
      this.free.push(this.makeConnection(i + 1));
    }
    log.info(
      { event: 'pool_recycled', poolSize: POOL_SIZE, droppedWaiters },
      'db pool recycled by operator',
    );
  }

  private expireWaiter(waiter: Waiter): void {
    const idx = this.waiters.indexOf(waiter);
    if (idx === -1) return;
    this.waiters.splice(idx, 1);
    const err = new OrderProcessingError(
      FailureCode.PoolTimeout,
      `timeout acquiring connection after ${ACQUIRE_TIMEOUT_MS}ms ` +
        `(pool ${this.inUse}/${POOL_SIZE} in use, ${this.waiters.length} waiting)`,
      true,
    );
    log.error(
      {
        event: 'pool_acquire_timeout',
        errorCode: FailureCode.PoolTimeout,
        inUse: this.inUse,
        poolSize: POOL_SIZE,
        waiting: this.waiters.length,
        err,
      },
      err.message,
    );
    waiter.reject(err);
  }

  private returnToPool(conn: PoolConnection): void {
    const waiter = this.waiters.shift();
    if (waiter) {
      // Hand the connection straight to the next waiter; it stays in use.
      clearTimeout(waiter.timer);
      this.checkedOut.set(conn.id, { conn, since: Date.now() });
      waiter.resolve(conn);
      return;
    }
    this.checkedOut.delete(conn.id);
    this.inUse--;
    this.free.push(conn);
  }

  private reapLeakedConnections(): void {
    const now = Date.now();
    for (const [id, entry] of this.checkedOut) {
      const heldMs = now - entry.since;
      if (heldMs < 60_000) continue;
      log.warn(
        { event: 'connection_leak_detected', connectionId: id, heldMs },
        `connection leak detected: connection #${id} held for ${heldMs}ms, forcibly reclaimed`,
      );
      this.checkedOut.delete(id);
      this.inUse--;
      this.free.push(entry.conn);
      const waiter = this.waiters.shift();
      if (waiter) {
        clearTimeout(waiter.timer);
        const fresh = this.free.pop();
        this.inUse++;
        this.checkedOut.set(fresh.id, { conn: fresh, since: Date.now() });
        waiter.resolve(fresh);
      }
    }
  }

  private checkPressure(): void {
    if (this.inUse < POOL_SIZE - 2) return;
    const now = Date.now();
    if (now - this.lastPressureLogAt < 30_000) return;
    this.lastPressureLogAt = now;
    log.warn(
      {
        event: 'pool_pressure',
        inUse: this.inUse,
        poolSize: POOL_SIZE,
        waiting: this.waiters.length,
      },
      `connection pool under pressure: ${this.inUse}/${POOL_SIZE} in use, ${this.waiters.length} waiting`,
    );
  }

  private makeConnection(id: number): PoolConnection {
    const conn: PoolConnection = {
      id,
      query: async (_sql: string, _params: any[] = []) => {
        await sleep(5 + Math.random() * 35);
        return [];
      },
      release: () => this.returnToPool(conn),
    };
    return conn;
  }
}
