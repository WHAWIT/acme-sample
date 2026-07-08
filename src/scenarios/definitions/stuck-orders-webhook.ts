import { createLogger } from '../../common/logger';
import { ScenarioDefinition } from '../scenario.types';

const gateway = createLogger('payment-gateway');

export const stuckOrdersWebhook: ScenarioDefinition = {
  name: 'stuck-orders-webhook',
  description:
    'The payment gateway authorizes but stops delivering capture-confirmation webhooks; orders pile up in FULFILLING and the stuck-order sweeper reports them as order_stuck_pending (ERR_PAYMENT_CONFIRMATION_TIMEOUT). On stop the confirmations resume and pending orders ship (or dead-letter if they aged out).',
  defaultDurationMinutes: 15,
  suggestedMonitorQuery:
    'order_stuck_pending / ERR_PAYMENT_CONFIRMATION_TIMEOUT for orders held in FULFILLING',
  onStart() {
    gateway.warn(
      { event: 'webhook_delivery_degraded', endpoint: 'payments.capture.confirm', provider: 'PayFlux' },
      'Capture-confirmation webhook delivery degraded (PayFlux)',
    );
  },
  onStop() {
    gateway.info(
      { event: 'webhook_delivery_recovered', endpoint: 'payments.capture.confirm', provider: 'PayFlux' },
      'Capture-confirmation webhook delivery recovered (PayFlux); draining pending captures',
    );
  },
};
