import { createLogger } from '../../common/logger';
import { runtimeState } from '../../common/runtime-state';
import { ScenarioDefinition } from '../scenario.types';

const deployer = createLogger('deployer');

export const badDeployNpe: ScenarioDefinition = {
  name: 'bad-deploy-npe',
  description:
    'Rolls out v1.5.0 alongside the SUMMER25 promo campaign; a share of checkouts starts crashing in pricing with a TypeError until the release is rolled back.',
  defaultDurationMinutes: 20,
  suggestedMonitorQuery: 'TypeError or unhandled exceptions in pricing shortly after a deployment_completed event',
  onStart() {
    runtimeState.setVersion('1.5.0');
    deployer.info(
      { event: 'deployment_completed', version: '1.5.0', previousVersion: '1.4.2', strategy: 'rolling' },
      'Deployment completed: acme-orders v1.5.0 (previous 1.4.2)',
    );
  },
  onStop() {
    runtimeState.setVersion('1.4.2');
    deployer.info(
      { event: 'deployment_rolled_back', version: '1.4.2', previousVersion: '1.5.0', strategy: 'rolling' },
      'Rollback completed: acme-orders v1.4.2',
    );
  },
};
