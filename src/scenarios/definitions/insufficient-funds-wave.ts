import { INSUFFICIENT_FUNDS_BIN, INSUFFICIENT_FUNDS_ISSUER } from '../scenario-inputs';
import { ScenarioDefinition } from '../scenario.types';

export const insufficientFundsWave: ScenarioDefinition = {
  name: 'insufficient-funds-wave',
  description:
    `Orders concentrate on one card BIN (${INSUFFICIENT_FUNDS_BIN}/${INSUFFICIENT_FUNDS_ISSUER}) whose issuer starts declining most authorizations for insufficient funds; payment_declined spikes for that BIN while other issuers stay healthy.`,
  defaultDurationMinutes: 15,
  suggestedMonitorQuery:
    'payment_declined with reason insufficient_funds concentrated on a single cardBin/issuer',
};
