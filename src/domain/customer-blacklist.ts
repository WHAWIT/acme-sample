/**
 * Customers hard-blocked at intake. These accounts accumulated chargebacks
 * and are refused before any pricing or payment work happens. The set is an
 * in-memory risk list; in production it is sourced from the fraud platform.
 */
export const CHARGEBACK_REASON = 'chargeback_history';

export interface BlacklistedCustomer {
  id: string;
  name: string;
}

export const BLACKLISTED_CUSTOMERS: BlacklistedCustomer[] = [
  { id: 'cus_blk4h2q', name: 'Devon Cross' },
  { id: 'cus_blk7m9r', name: 'Priya Ramanujan' },
  { id: 'cus_blk1q5s', name: 'Marcus Vandenberg' },
  { id: 'cus_blk9z3t', name: 'Yelena Sokolova' },
];

const BLACKLIST_IDS = new Set(BLACKLISTED_CUSTOMERS.map((c) => c.id));

export function isCustomerBlocked(customerId: string): boolean {
  return BLACKLIST_IDS.has(customerId);
}
