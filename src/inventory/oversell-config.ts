/**
 * Inventory-oversell tuning. Two catalog SKUs are declared "hot"; the
 * generator concentrates demand on them at inflated quantities while the
 * inventory sim keeps their effective on-hand below the reservation ledger,
 * so the allocation gate (which reads the availability cache) clears orders
 * that the ledger cannot actually fulfil.
 */

/** High-demand SKUs the flash promo drives traffic to. Both exist in the seed catalog. */
export const HOT_SKUS = ['ELC-MON-20', 'CFE-GRD-20'];

/** Effective on-hand the sim holds the hot SKUs at while the scenario runs. */
export const OVERSELL_LEDGER_FLOOR_MIN = 4;
export const OVERSELL_LEDGER_FLOOR_MAX = 14;

/** Inflated availability served to the allocation gate, so it keeps clearing. */
export const OVERSELL_CACHE_ONHAND = 500;

/** On-hand the hot SKUs are replenished to when the scenario stops. */
export const OVERSELL_RESTORE_ONHAND = 320;

/** Quantity range the generator requests for hot SKUs during the scenario. */
export const OVERSELL_ORDER_QTY_MIN = 12;
export const OVERSELL_ORDER_QTY_MAX = 40;

/** How often the sim re-asserts the depleted-stock condition. */
export const OVERSELL_SYNC_MS = 500;
