import { FailureCode, OrderProcessingError } from './failure-codes';

/**
 * Infrastructure failures are real exceptions with a stack, a name and a
 * cause, not just a code: an investigation needs the frame that raised them
 * and the upstream detail. They extend OrderProcessingError so every
 * `instanceof` / `code` check in the pipeline keeps working.
 */
export class PoolTimeoutError extends OrderProcessingError {
  constructor(
    message: string,
    readonly pool: { inUse: number; size: number; waiting: number; acquireTimeoutMs: number; statement?: string },
  ) {
    super(FailureCode.PoolTimeout, message, true);
    this.name = 'PoolTimeoutError';
  }
}

export class GatewayError extends OrderProcessingError {
  constructor(
    message: string,
    readonly gateway: { op: string; status?: number; acquirer?: string; latencyMs: number },
    options?: { cause?: unknown },
  ) {
    super(FailureCode.GatewayBadGateway, message, true);
    this.name = 'GatewayError';
    if (options?.cause !== undefined) (this as any).cause = options.cause;
  }
}

export class GatewayTimeoutError extends OrderProcessingError {
  constructor(message: string, readonly gateway: { op: string; timeoutMs: number; acquirer?: string }) {
    super(FailureCode.GatewayTimeout, message, true);
    this.name = 'GatewayTimeoutError';
  }
}

export class CircuitOpenError extends OrderProcessingError {
  constructor(message: string, readonly breaker: { consecutiveFailures: number; resetMs: number; lastError?: string }) {
    super(FailureCode.CircuitOpen, message, true);
    this.name = 'CircuitOpenError';
  }
}
