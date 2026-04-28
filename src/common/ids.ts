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
