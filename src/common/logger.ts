import pino from 'pino';
import { runtimeState } from './runtime-state';

/**
 * All logs are single-line JSON on stdout, shaped for Google Cloud Logging:
 *  - `severity` uses the Cloud Logging enum (DEBUG/INFO/WARNING/ERROR/CRITICAL)
 *  - `message` is the display field
 *  - `logging.googleapis.com/trace` / `spanId` / `sourceLocation` are the
 *    special fields Cloud Logging lifts out of the payload
 * Cloud Run forwards stdout to Cloud Logging with no agent required.
 */
const GCP_SEVERITY: Record<string, string> = {
  trace: 'DEBUG',
  debug: 'DEBUG',
  info: 'INFO',
  warn: 'WARNING',
  error: 'ERROR',
  fatal: 'CRITICAL',
};

export const GCP_PROJECT = process.env.GCP_PROJECT || 'whawit';

/** Deployment and runtime context stamped on every line. */
export const runtimeContext = {
  revision: process.env.K_REVISION || 'local',
  commitSha: process.env.COMMIT_SHA || 'unknown',
  environment: process.env.ENVIRONMENT || 'production',
  region: process.env.REGION || 'us-central1',
};

const root = pino({
  messageKey: 'message',
  base: undefined,
  timestamp: () => `,"timestamp":"${new Date().toISOString()}"`,
  formatters: {
    level(label) {
      return { severity: GCP_SEVERITY[label] ?? 'DEFAULT' };
    },
  },
  mixin() {
    return {
      version: runtimeState.version,
      instanceId: runtimeState.instanceId,
      ...runtimeContext,
    };
  },
  serializers: {
    err: pino.stdSerializers.err,
  },
  level: process.env.LOG_LEVEL || 'info',
});

export type AppLogger = pino.Logger;

export function createLogger(component: string): AppLogger {
  return root.child({ component });
}

/** Correlation bindings every line about one order carries. */
export interface OrderContext {
  id: string;
  customerId: string;
  channel: string;
  appVersion: string;
  traceId: string;
}

/**
 * A child logger bound to one order: orderId, customerId, channel, appVersion,
 * traceId and the Cloud Logging trace field, so every hop of the async pipeline
 * is one click away from every other in Logs Explorer.
 */
export function orderLogger(base: AppLogger, order: OrderContext): AppLogger {
  return base.child({
    orderId: order.id,
    customerId: order.customerId,
    channel: order.channel,
    appVersion: order.appVersion,
    traceId: order.traceId,
    'logging.googleapis.com/trace': `projects/${GCP_PROJECT}/traces/${order.traceId}`,
  });
}

const FRAME = /at (?:(?<fn>[^(]+) \()?(?<file>[^():]+):(?<line>\d+):\d+\)?/;

/**
 * Fields for an ERROR line that carries a real exception: pino's `err`
 * serializer output plus the Cloud Logging source location of the frame that
 * raised it, so an investigation can open the file at the line.
 */
export function errorFields(err: unknown): Record<string, unknown> {
  const fields: Record<string, unknown> = { err };
  const stack = err instanceof Error ? err.stack : undefined;
  const frame = stack?.split('\n').slice(1).find((line) => /^\s*at /.test(line) && !/node:internal|node_modules/.test(line));
  const m = frame?.match(FRAME);
  if (m?.groups) {
    fields['logging.googleapis.com/sourceLocation'] = {
      file: m.groups.file.replace(/^\/app\//, ''),
      line: m.groups.line,
      function: (m.groups.fn || '').trim() || undefined,
    };
  }
  return fields;
}
