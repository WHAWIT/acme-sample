import { Injectable } from '@nestjs/common';
import { ScenarioEngine } from '../scenarios/scenario.engine';
import { DbPool } from '../infra/db-pool';
import { OrderRepository } from '../orders/order.repository';
import { runtimeState } from '../common/runtime-state';
import { runtimeContext, createLogger } from '../common/logger';

const log = createLogger('ops-mcp');

/**
 * The operator actions Acme exposes to its own tooling — and, through the
 * MCP endpoint, to Whawit. Each one is something a human on-call would do
 * from the runbook; none of them touches order data.
 */
@Injectable()
export class OpsToolsService {
  constructor(
    private readonly engine: ScenarioEngine,
    private readonly dbPool: DbPool,
    private readonly repository: OrderRepository,
  ) {}

  status() {
    const now = Date.now();
    return {
      service: 'acme-orders',
      version: runtimeState.version,
      revision: runtimeContext.revision,
      commitSha: runtimeContext.commitSha,
      environment: runtimeContext.environment,
      region: runtimeContext.region,
      orders: { byState: this.repository.countsByState(), active: this.repository.activeCount() },
      pool: this.dbPool.stats(),
      activeFaults: this.engine
        .list()
        .filter((s) => s.activation)
        .map((s) => ({
          name: s.name,
          intensity: s.activation!.intensity,
          remainingSeconds: Math.max(0, Math.round((s.activation!.expiresAt.getTime() - now) / 1000)),
        })),
    };
  }

  /** Rolls the service back to the last stable release when a newer one is serving. */
  rollbackRelease(reason?: string) {
    const before = runtimeState.version;
    const badDeployActive = this.engine.isActive('bad-deploy-npe');
    if (!badDeployActive) {
      log.info({ event: 'rollback_requested', version: before, reason, noop: true }, `Rollback requested but acme-orders is already on stable release ${before}; nothing to do`);
      return { rolledBack: false, version: before, revision: runtimeContext.revision, message: `acme-orders is already on stable release ${before}` };
    }
    log.warn({ event: 'rollback_requested', version: before, reason }, `Rollback of acme-orders ${before} requested by operator tooling: ${reason ?? 'no reason given'}`);
    this.engine.stop('bad-deploy-npe', 'stopped');
    const after = runtimeState.version;
    return {
      rolledBack: true,
      from: before,
      version: after,
      revision: runtimeContext.revision,
      message: `Rolled back acme-orders from ${before} to ${after}; the ${before} release no longer serves traffic`,
    };
  }

  /** Emergency pool recycle from the db-pool runbook. */
  recycleDbPool(reason?: string) {
    const before = this.dbPool.stats();
    log.warn({ event: 'pool_recycle_requested', pool: before, reason }, `Database pool recycle requested by operator tooling (${before.inUse}/${before.poolSize} in use, ${before.waiting} waiting): ${reason ?? 'no reason given'}`);
    if (this.engine.isActive('db-pool-exhaustion')) this.engine.stop('db-pool-exhaustion', 'stopped');
    else this.dbPool.recycle();
    return { recycled: true, before, after: this.dbPool.stats(), message: `Recycled the database connection pool (${before.inUse}/${before.poolSize} were in use, ${before.waiting} callers waiting)` };
  }
}
