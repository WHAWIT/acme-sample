export type Intensity = 'low' | 'medium' | 'high';

export type ScenarioName =
  | 'payment-gateway-outage'
  | 'db-pool-exhaustion'
  | 'memory-leak-degradation'
  | 'bad-deploy-npe'
  | 'inventory-desync'
  | 'checkout-latency-spike'
  | 'duplicate-order-storm'
  | 'payment-mismatch-spike';

export interface ScenarioDefinition {
  name: ScenarioName;
  description: string;
  defaultDurationMinutes: number;
  /** Natural-language monitor query this scenario is designed to trip. */
  suggestedMonitorQuery: string;
  onStart?(intensity: Intensity): void;
  onStop?(reason: 'expired' | 'stopped'): void;
}

export interface ScenarioActivation {
  name: ScenarioName;
  intensity: Intensity;
  startedAt: Date;
  expiresAt: Date;
}
