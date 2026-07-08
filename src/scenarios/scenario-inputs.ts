import { OrderChannel } from '../domain/order.entity';

/**
 * Named tuning inputs for the correlation-focused scenarios. The generator
 * biases order DTOs using these rates and the simulated dependencies read a
 * few of them (card BIN, decline rate) so the *frequency* of an input changes
 * with the active scenario while the domain checks stay constant.
 *
 * Rates suffixed `_BASELINE` are the always-on functional drip. The other
 * rates are the per-tick probability an order carries the scenario's signal;
 * they are multiplied by the engine intensity factor (low=1, medium=2, high=4)
 * and clamped by CONCENTRATION_CAP.
 */

export interface CardBin {
  bin: string;
  issuer: string;
}

/** Baseline mix of card BINs the storefront sees. Fictional issuers. */
export const CARD_BINS: CardBin[] = [
  { bin: '411773', issuer: 'BancoSol' },
  { bin: '424288', issuer: 'BancoSol' },
  { bin: '451788', issuer: 'NorthBank' },
  { bin: '517805', issuer: 'Cardex' },
  { bin: '531942', issuer: 'Cardex' },
  { bin: '601199', issuer: 'Meridian Credit' },
  { bin: '379100', issuer: 'Vanguard Charge' },
];

/** The one BIN whose issuer authorization degrades during the funds wave. */
export const INSUFFICIENT_FUNDS_BIN = '451788';
export const INSUFFICIENT_FUNDS_ISSUER = 'NorthBank';
export const INSUFFICIENT_FUNDS_DECLINE_RATE = 0.6;

/** Channel mix: web-heavy with a healthy mobile share and a small API tail. */
export const CHANNEL_WEIGHTS: Array<[OrderChannel, number]> = [
  ['web', 0.55],
  ['mobile', 0.35],
  ['api', 0.1],
];

/** Client build strings per channel. Mobile rides its own release train. */
export const MOBILE_BASELINE_VERSIONS = ['2.2.4', '2.2.5', '2.2.5', '2.2.5'];
export const WEB_APP_VERSION = '4.10.2';
export const API_CLIENT_VERSION = 'partner-api-1.8.0';

/** The regressed mobile build shipped by checkout-missing-field. */
export const BAD_MOBILE_VERSION = '2.3.0';
export const ROLLFORWARD_MOBILE_VERSION = '2.3.1';

/** Last summer's promo, still cached on a stale CDN banner. Long expired. */
export const EXPIRED_PROMO = 'SUMMER24';

// Always-on functional drip.
export const RATE_MISSING_ZIP_BASELINE = 0.003;
export const RATE_BLOCKED_CUSTOMER_BASELINE = 0.001;

// Per-tick input probabilities, scaled by the intensity factor.
export const RATE_CHECKOUT_MISSING_FIELD = 0.08;
export const RATE_INSUFFICIENT_FUNDS = 0.4;
export const RATE_EXPIRED_PROMO_WEB = 0.25;
export const RATE_OVERSELL_CONCENTRATION = 0.6;

/** Upper bound on any factor-scaled concentration rate. */
export const CONCENTRATION_CAP = 0.85;
