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
import { checkoutMissingField } from './checkout-missing-field';
import { insufficientFundsWave } from './insufficient-funds-wave';
import { expiredPromoFlood } from './expired-promo-flood';
import { inventoryOversell } from './inventory-oversell';
import { blockedCustomerRetryStorm } from './blocked-customer-retry-storm';
import { stuckOrdersWebhook } from './stuck-orders-webhook';

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
    checkoutMissingField,
    insufficientFundsWave,
    expiredPromoFlood,
    inventoryOversell,
    blockedCustomerRetryStorm,
    stuckOrdersWebhook,
  ];
  for (const definition of definitions) {
    engine.register(definition);
  }
}
