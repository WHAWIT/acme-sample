import { ScenarioDefinition } from '../scenario.types';

export const paymentMismatchSpike: ScenarioDefinition = {
  name: 'payment-mismatch-spike',
  description:
    'Carts skew toward prices like 19.99 at drift-prone quantities; floating-point totals disagree with the authorized amount by a cent and reconciliation flags mismatches.',
  defaultDurationMinutes: 10,
  suggestedMonitorQuery: 'ERR_AMOUNT_MISMATCH or authorized amount differing from order total by less than 0.05',
};
