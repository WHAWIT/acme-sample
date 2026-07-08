import { Injectable } from '@nestjs/common';
import { createLogger } from '../common/logger';
import { FailureCode, OrderProcessingError } from '../domain/failure-codes';
import { ScenarioEngine } from '../scenarios/scenario.engine';
import {
  INSUFFICIENT_FUNDS_BIN,
  INSUFFICIENT_FUNDS_DECLINE_RATE,
} from '../scenarios/scenario-inputs';
import { simConfig } from '../simulation/sim-config';

const log = createLogger('payment-gateway');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Client-side view of the external payment gateway (PayFlux).
 */
@Injectable()
export class PaymentGatewaySim {
  constructor(private readonly engine: ScenarioEngine) {}

  async authorize(amountCents: number): Promise<{ authCode: string }> {
    return this.roundTrip('authorize', amountCents);
  }

  async capture(amountCents: number): Promise<{ authCode: string }> {
    return this.roundTrip('capture', amountCents);
  }

  /**
   * Issuer-side decline advisory for the funds wave: during the scenario the
   * one affected BIN starts declining most authorizations for insufficient
   * funds. Reading the engine here keeps the rate change in the sim layer.
   */
  insufficientFundsDecline(cardBin: string): boolean {
    if (!this.engine.isActive('insufficient-funds-wave')) return false;
    if (cardBin !== INSUFFICIENT_FUNDS_BIN) return false;
    return Math.random() < INSUFFICIENT_FUNDS_DECLINE_RATE;
  }

  /**
   * While the webhook scenario is active the gateway authorizes but stops
   * delivering capture confirmations, leaving captured orders un-settled.
   */
  captureConfirmationHeld(): boolean {
    return this.engine.isActive('stuck-orders-webhook');
  }

  private async roundTrip(op: string, amountCents: number): Promise<{ authCode: string }> {
    const started = Date.now();

    if (this.engine.isActive('payment-gateway-outage')) {
      const roll = Math.random();
      if (roll < 0.7) {
        await sleep(50 + Math.random() * 200);
        log.error(
          { event: 'gateway_error', op, status: 502, errorCode: FailureCode.GatewayBadGateway, latencyMs: Date.now() - started },
          `Payment gateway returned HTTP 502 Bad Gateway (${op})`,
        );
        throw new OrderProcessingError(FailureCode.GatewayBadGateway, 'Payment gateway returned HTTP 502 Bad Gateway', true);
      }
      if (roll < 0.9) {
        await sleep(10_000);
        log.error(
          { event: 'gateway_timeout', op, errorCode: FailureCode.GatewayTimeout, latencyMs: Date.now() - started },
          `Payment gateway request timed out after 10000ms (ETIMEDOUT)`,
        );
        throw new OrderProcessingError(FailureCode.GatewayTimeout, 'Payment gateway request timed out after 10000ms (ETIMEDOUT)', true);
      }
    } else if (simConfig.baselineNoise && Math.random() < 0.002) {
      await sleep(80 + Math.random() * 300);
      log.error(
        { event: 'gateway_error', op, status: 502, errorCode: FailureCode.GatewayBadGateway, latencyMs: Date.now() - started },
        `Payment gateway returned HTTP 502 Bad Gateway (${op})`,
      );
      throw new OrderProcessingError(FailureCode.GatewayBadGateway, 'Payment gateway returned HTTP 502 Bad Gateway', true);
    }

    await sleep(80 + Math.random() * 320);
    return { authCode: `auth_${amountCents}_${Date.now().toString(36)}` };
  }
}
