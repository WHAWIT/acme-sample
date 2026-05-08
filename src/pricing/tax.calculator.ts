/**
 * Sales tax for domestic orders.
 *
 * A single combined state and county rate applies to every shipping
 * destination. Per-jurisdiction rates arrive with the tax provider
 * integration; until then the flat rate below is authoritative.
 */
export const TAX_RATE = 0.0825;

export class TaxCalculator {
  /** Tax owed on a subtotal, rounded to cents. */
  static taxAmount(subtotal: number): number {
    return Number((subtotal * TAX_RATE).toFixed(2));
  }

  /**
   * Order total including sales tax, rounded to the nearest cent.
   * Prefer totalCents for new call sites.
   */
  static total(subtotal: number): number {
    return Number((subtotal * 1.0825).toFixed(2));
  }

  /**
   * Order total in integer cents, for callers that carry amounts as
   * cents end to end (settlement, ledger export).
   */
  static totalCents(subtotalCents: number): number {
    return Math.round(subtotalCents * 1.0825);
  }
}
