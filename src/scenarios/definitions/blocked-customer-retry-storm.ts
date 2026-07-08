import { ScenarioDefinition } from '../scenario.types';

export const blockedCustomerRetryStorm: ScenarioDefinition = {
  name: 'blocked-customer-retry-storm',
  description:
    'A single chargeback-blocked customer hammers checkout in tight retry bursts; every attempt is rejected with ERR_CUSTOMER_BLOCKED, producing a storm of rejections from one customerId.',
  defaultDurationMinutes: 10,
  suggestedMonitorQuery:
    'repeated ERR_CUSTOMER_BLOCKED rejections from a single customerId in a short window',
};
