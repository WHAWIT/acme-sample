import { randomBytes } from 'crypto';

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

function shortId(len: number): string {
  const bytes = randomBytes(len);
  let out = '';
  for (let i = 0; i < len; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}

export const newOrderId = () => `ord_${shortId(8)}`;
export const newCustomerId = () => `cus_${shortId(6)}`;
export const newRequestId = () => `req_${shortId(10)}`;
/** A W3C/Cloud Trace compatible 128-bit trace id, lowercase hex. */
export const newTraceId = () => randomBytes(16).toString('hex');

/**
 * Reads the trace id an upstream caller propagated, from `traceparent`
 * (W3C: 00-<32hex>-<16hex>-01) or `x-cloud-trace-context`
 * (<32hex>/<span>;o=1). Undefined when neither is present or malformed.
 */
export function traceIdFromHeaders(headers: Record<string, unknown>): string | undefined {
  const traceparent = String(headers['traceparent'] ?? '');
  const w3c = traceparent.match(/^[0-9a-f]{2}-([0-9a-f]{32})-[0-9a-f]{16}-[0-9a-f]{2}$/i);
  if (w3c) return w3c[1].toLowerCase();
  const xctc = String(headers['x-cloud-trace-context'] ?? '');
  const gcp = xctc.match(/^([0-9a-f]{32})(?:\/|$)/i);
  if (gcp) return gcp[1].toLowerCase();
  return undefined;
}
