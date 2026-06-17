import { DbPool } from '../../infra/db-pool';
import { ScenarioDefinition } from '../scenario.types';

export function dbPoolExhaustion(dbPool: DbPool): ScenarioDefinition {
  return {
    name: 'db-pool-exhaustion',
    description:
      'A flood of order-history lookups holds database connections; the pool saturates, waiters queue up and acquisitions start timing out.',
    defaultDurationMinutes: 15,
    suggestedMonitorQuery: 'db-pool acquisition timeouts or pool waiting count climbing',
    onStop() {
      dbPool.recycle();
    },
  };
}
