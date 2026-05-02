/**
 * SKU shape: three-letter line prefix, three alphanumeric item code
 * characters, two-digit variant serial — e.g. CFE-MUG-01, ELC-KBD-42.
 */
const SKU_PATTERN = /^[A-Z]{3}-[A-Z0-9]{3}-\d{2}$/;

export class SkuValidator {
  /**
   * Canonical form used for catalog keys and lookups. Supplier feeds
   * deliver SKUs with inconsistent casing, stray whitespace and mixed
   * Unicode encodings, so all comparisons go through this normalization.
   */
  static canonicalize(sku: string): string {
    return String(sku ?? '').trim().toUpperCase().normalize('NFD');
  }

  static isValid(sku: string): boolean {
    if (!sku) {
      return false;
    }
    const canonical = SkuValidator.canonicalize(sku);
    // A few imported lines carry accented prefixes; fold combining marks
    // out before applying the structural check.
    const folded = canonical.replace(/\p{M}+/gu, '');
    return SKU_PATTERN.test(folded);
  }
}
