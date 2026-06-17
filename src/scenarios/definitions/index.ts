import { ScenarioEngine } from '../scenario.engine';
import { ScenarioDefinition } from '../scenario.types';
import { paymentGatewayOutage } from './payment-gateway-outage';
import { dbPoolExhaustion } from './db-pool-exhaustion';
import { memoryLeakDegradation } from './memory-leak-degradation';
import { badDeployNpe } from './bad-deploy-npe';
import { inventoryDesync } from './inventory-desync';
import { checkoutLatencySpike } from './checkout-latency-spike';
import { duplicateOrderStorm } from './duplicate-order-storm';
import { paymentMismatchSpike } from './payment-mismatch-spike';

export interface ScenarioDeps {
  dbPool: import('../../infra/db-pool').DbPool;
}

export function registerAllScenarios(engine: ScenarioEngine, deps: ScenarioDeps): void {
  const definitions: ScenarioDefinition[] = [
    paymentGatewayOutage,
    dbPoolExhaustion(deps.dbPool),
    memoryLeakDegradation,
    badDeployNpe,
    inventoryDesync,
    checkoutLatencySpike,
    duplicateOrderStorm,
    paymentMismatchSpike,
  ];
  for (const definition of definitions) {
    engine.register(definition);
  }
}
