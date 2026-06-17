import { ScenarioDefinition } from '../scenario.types';

export const paymentGatewayOutage: ScenarioDefinition = {
  name: 'payment-gateway-outage',
  description:
    'The upstream card gateway degrades: authorizations time out or return 502, retries pile up and the payment circuit breaker eventually opens.',
  defaultDurationMinutes: 10,
  suggestedMonitorQuery: 'errors from payment-client mentioning gateway timeouts or 502',
};
