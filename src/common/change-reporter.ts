import { createLogger, runtimeContext } from './logger';

const log = createLogger('deployer');

const REPO = 'WHAWIT/acme-sample';
const WEBHOOK_URL = process.env.CHANGE_WEBHOOK_URL || '';
const REQUEST_TIMEOUT_MS = 8_000;

export interface DeploymentReport {
  sha: string;
  version: string;
  description: string;
  environment?: string;
}

/**
 * Tells Whawit what shipped. The change webhook takes GitHub-shaped
 * `deployment_status` payloads, so a deploy of this service lands in the
 * incident timeline as a change event with the commit it can open.
 * Never throws and never logs the URL: it carries the auth token.
 */
export async function reportDeployment(report: DeploymentReport): Promise<void> {
  if (!WEBHOOK_URL) {
    log.debug({ event: 'change_event_skipped', version: report.version }, 'CHANGE_WEBHOOK_URL not set; deployment not reported');
    return;
  }
  const now = new Date().toISOString();
  const environment = report.environment ?? runtimeContext.environment;
  const body = {
    __event: 'deployment_status',
    deployment: {
      id: Date.now(),
      sha: report.sha,
      ref: 'main',
      environment,
      task: 'deploy',
      description: report.description,
      // Free-form deployment payload, as GitHub passes it through: names the service so
      // Whawit's blast window can match the change to the incident's service.
      payload: { service: 'acme-orders', version: report.version },
      created_at: now,
    },
    deployment_status: {
      state: 'success',
      environment,
      created_at: now,
      creator: { login: 'acme-ci' },
      target_url: `https://github.com/${REPO}/commit/${report.sha}`,
      description: report.description,
    },
    repository: { full_name: REPO, html_url: `https://github.com/${REPO}` },
  };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await res.text().catch(() => '');
    if (res.ok) {
      log.info(
        { event: 'change_event_reported', version: report.version, sha: report.sha, environment, status: res.status, response: text.slice(0, 200) },
        `Reported deployment of acme-orders ${report.version} (${report.sha.slice(0, 7)}) to the change webhook: HTTP ${res.status}`,
      );
    } else {
      log.warn(
        { event: 'change_event_failed', version: report.version, sha: report.sha, status: res.status, response: text.slice(0, 200) },
        `Change webhook rejected the deployment report for ${report.version}: HTTP ${res.status}`,
      );
    }
  } catch (err) {
    log.warn({ event: 'change_event_failed', version: report.version, sha: report.sha, err }, `Could not report deployment of ${report.version}: ${(err as Error).message}`);
  } finally {
    clearTimeout(timer);
  }
}
