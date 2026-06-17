import { ScenarioDefinition } from '../scenario.types';

export const duplicateOrderStorm: ScenarioDefinition = {
  name: 'duplicate-order-storm',
  description:
    'A buggy storefront client retries checkout submissions concurrently with the same Idempotency-Key, racing the dedupe path and surfacing duplicate orders.',
  defaultDurationMinutes: 10,
  suggestedMonitorQuery: 'duplicate order warnings or ERR_DUPLICATE_ORDER with repeated idempotency keys',
};
