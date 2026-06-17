import { ScenarioDefinition } from '../scenario.types';

export const checkoutLatencySpike: ScenarioDefinition = {
  name: 'checkout-latency-spike',
  description:
    'Checkout and quote endpoints slow down sharply; p95 latency multiplies while error rates stay flat, the classic silent-degradation page.',
  defaultDurationMinutes: 10,
  suggestedMonitorQuery: 'latencyMs p95 spike on checkout endpoints without a matching error-rate increase',
};
