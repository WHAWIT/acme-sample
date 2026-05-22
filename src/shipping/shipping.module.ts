import { Module } from '@nestjs/common';
import { DeliveryEstimator } from './delivery-estimator';
import { ShippingService } from './shipping.service';

@Module({
  providers: [DeliveryEstimator, ShippingService],
  exports: [ShippingService],
})
export class ShippingModule {}
