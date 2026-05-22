import { Injectable } from '@nestjs/common';
import { createLogger } from '../common/logger';
import { FailureCode, OrderProcessingError } from '../domain/failure-codes';
import { Order } from '../domain/order.entity';
import { DeliveryEstimator } from './delivery-estimator';

const log = createLogger('shipping-service');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const CARRIERS = ['UPS', 'FedEx', 'DHL'] as const;

@Injectable()
export class ShippingService {
  constructor(private readonly estimator: DeliveryEstimator) {}

  async arrangeShipment(order: Order): Promise<{ carrier: string; trackingId: string; eta: Date }> {
    await sleep(50 + Math.random() * 150);

    if (Math.random() < 0.005) {
      const { country, zip } = order.shippingAddress;
      const err = new OrderProcessingError(
        FailureCode.NoCarrier,
        `No carrier serves destination ${country}/${zip}`,
      );
      log.warn(
        { event: 'no_carrier_available', errorCode: FailureCode.NoCarrier, orderId: order.id, country, zip, err },
        err.message,
      );
      throw err;
    }

    const carrier = CARRIERS[Math.floor(Math.random() * CARRIERS.length)];
    const trackingId = this.newTrackingId(carrier);
    const eta = this.estimator.estimateDelivery(order);

    log.info(
      { event: 'shipment_arranged', orderId: order.id, carrier, trackingId, eta: eta.toISOString() },
      `Shipment arranged with ${carrier} (${trackingId}) for order ${order.id}`,
    );
    return { carrier, trackingId, eta };
  }

  private newTrackingId(carrier: string): string {
    const digits = (n: number) =>
      Array.from({ length: n }, () => Math.floor(Math.random() * 10)).join('');
    switch (carrier) {
      case 'UPS':
        return `1Z${digits(10)}`;
      case 'FedEx':
        return digits(12);
      default:
        return `JD${digits(10)}`;
    }
  }
}
