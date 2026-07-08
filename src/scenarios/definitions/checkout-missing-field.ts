import { createLogger } from '../../common/logger';
import { BAD_MOBILE_VERSION, ROLLFORWARD_MOBILE_VERSION } from '../scenario-inputs';
import { ScenarioDefinition } from '../scenario.types';

const deployer = createLogger('deployer');

export const checkoutMissingField: ScenarioDefinition = {
  name: 'checkout-missing-field',
  description:
    'A regressed acme-mobile-app build (2.3.0) drops the shipping postal code on checkout; a share of mobile orders start getting rejected with ERR_MISSING_SHIPPING_ZIP until a rollforward ships.',
  defaultDurationMinutes: 20,
  suggestedMonitorQuery:
    'ERR_MISSING_SHIPPING_ZIP order rejections concentrated on channel=mobile appVersion=2.3.0 shortly after a mobile app deploy',
  onStart() {
    deployer.info(
      { event: 'deployment_completed', service: 'acme-mobile-app', version: BAD_MOBILE_VERSION, previousVersion: '2.2.5', strategy: 'store-rollout' },
      `Deployment completed: acme-mobile-app v${BAD_MOBILE_VERSION}`,
    );
  },
  onStop() {
    deployer.info(
      { event: 'deployment_completed', service: 'acme-mobile-app', version: ROLLFORWARD_MOBILE_VERSION, previousVersion: BAD_MOBILE_VERSION, strategy: 'store-rollout' },
      `Deployment completed: acme-mobile-app v${ROLLFORWARD_MOBILE_VERSION} (checkout fix rollforward)`,
    );
  },
};
