import { createLogger, runtimeContext } from '../../common/logger';
import { reportDeployment } from '../../common/change-reporter';
import { runtimeState } from '../../common/runtime-state';
import { ScenarioDefinition } from '../scenario.types';

const deployer = createLogger('deployer');
/** The commit the "bad" release points at; defaults to what is actually running. */
const BAD_DEPLOY_SHA = process.env.BAD_DEPLOY_SHA || runtimeContext.commitSha;
const STABLE_VERSION = process.env.SERVICE_VERSION || '1.4.3';

export const badDeployNpe: ScenarioDefinition = {
  name: 'bad-deploy-npe',
  description:
    'Rolls out v1.5.0 alongside the SUMMER25 promo campaign; a share of checkouts starts crashing in pricing with a TypeError until the release is rolled back.',
  defaultDurationMinutes: 20,
  suggestedMonitorQuery: 'TypeError or unhandled exceptions in pricing shortly after a deployment_completed event',
  onStart() {
    const previousVersion = runtimeState.version;
    runtimeState.setVersion('1.5.0');
    deployer.info(
      { event: 'deployment_completed', version: '1.5.0', previousVersion, strategy: 'rolling', commitSha: BAD_DEPLOY_SHA },
      `Deployment completed: acme-orders v1.5.0 (previous ${previousVersion}) — SUMMER25 campaign pricing`,
    );
    void reportDeployment({
      sha: BAD_DEPLOY_SHA,
      version: '1.5.0',
      description: 'Deployed acme-orders 1.5.0 to Cloud Run (SUMMER25 campaign pricing)',
    });
  },
  onStop() {
    runtimeState.setVersion(STABLE_VERSION);
    deployer.info(
      { event: 'deployment_rolled_back', version: STABLE_VERSION, previousVersion: '1.5.0', strategy: 'rolling', commitSha: runtimeContext.commitSha },
      `Rollback completed: acme-orders v${STABLE_VERSION} (rolled back from 1.5.0)`,
    );
    void reportDeployment({
      sha: runtimeContext.commitSha,
      version: STABLE_VERSION,
      description: `Rollback to acme-orders ${STABLE_VERSION}`,
    });
  },
};
