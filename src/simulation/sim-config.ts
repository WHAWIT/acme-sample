/**
 * Runtime-tunable simulation rates. Mutated only via the admin API.
 */
export class SimConfig {
  orderRatePerMin = Number(process.env.ORDER_RATE_PER_MIN || 8);
  queryRatePerMin = Number(process.env.QUERY_RATE_PER_MIN || 6);
  baselineNoise = (process.env.BASELINE_NOISE ?? 'true') !== 'false';
}

export const simConfig = new SimConfig();
