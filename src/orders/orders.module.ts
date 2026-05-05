import { Module } from '@nestjs/common';
import { CatalogModule } from '../catalog/catalog.module';
import { PricingModule } from '../pricing/pricing.module';
import { PaymentsModule } from '../payments/payments.module';
import { FraudModule } from '../fraud/fraud.module';
import { InventoryModule } from '../inventory/inventory.module';
import { ShippingModule } from '../shipping/shipping.module';
import { InfraModule } from '../infra/infra.module';
import { IdempotencyStore } from './idempotency.store';
import { OrderRepository } from './order.repository';
import { OrderPipelineService } from './order-pipeline.service';
import { OrdersService } from './orders.service';
import { OrdersController } from './orders.controller';

@Module({
  imports: [
    CatalogModule,
    PricingModule,
    PaymentsModule,
    FraudModule,
    InventoryModule,
    ShippingModule,
    InfraModule,
  ],
  controllers: [OrdersController],
  providers: [IdempotencyStore, OrderRepository, OrderPipelineService, OrdersService],
  exports: [OrdersService, OrderRepository],
})
export class OrdersModule {}
