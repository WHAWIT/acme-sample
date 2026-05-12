import { Module } from '@nestjs/common';
import { PaymentGatewaySim } from './payment.gateway.sim';
import { PaymentClient } from './payment-client';

@Module({
  providers: [PaymentGatewaySim, PaymentClient],
  exports: [PaymentClient, PaymentGatewaySim],
})
export class PaymentsModule {}
