import { createLogger } from '../../common/logger';
import { EXPIRED_PROMO } from '../scenario-inputs';
import { ScenarioDefinition } from '../scenario.types';

const edge = createLogger('edge-cache');

export const expiredPromoFlood: ScenarioDefinition = {
  name: 'expired-promo-flood',
  description:
    `A stale CDN banner keeps advertising last summer's ${EXPIRED_PROMO} code; web checkouts flood in carrying the expired promo and the pricing step logs ERR_PROMO_EXPIRED before repricing without it.`,
  defaultDurationMinutes: 15,
  suggestedMonitorQuery:
    `ERR_PROMO_EXPIRED / promo_rejected spike for promoCode ${EXPIRED_PROMO} on channel=web`,
  onStart() {
    edge.warn(
      { event: 'cdn_cache_stale', asset: 'landing/promo-banner', cachedVersion: 'summer-sale' },
      'CDN serving a stale promo banner (cachedVersion summer-sale)',
    );
  },
};
