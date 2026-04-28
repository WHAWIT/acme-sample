import pino from 'pino';
import { runtimeState } from './runtime-state';

/**
 * All logs are single-line JSON on stdout, shaped for Google Cloud Logging:
 *  - `severity` uses the Cloud Logging enum (DEBUG/INFO/WARNING/ERROR/CRITICAL)
 *  - `message` is the display field
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
