import { Module } from '@nestjs/common';
import { ScenariosModule } from './scenarios/scenarios.module';
import { CatalogModule } from './catalog/catalog.module';
import { PricingModule } from './pricing/pricing.module';
import { PaymentsModule } from './payments/payments.module';
import { InventoryModule } from './inventory/inventory.module';
import { OrdersModule } from './orders/orders.module';
import { ReportsModule } from './reports/reports.module';
import { AdminModule } from './admin/admin.module';
import { SimulationModule } from './simulation/simulation.module';
import { HealthController } from './health/health.controller';
import { AcmeMcpModule } from './mcp/acme-mcp.module';

@Module({
  imports: [
    ScenariosModule,
    CatalogModule,
    PricingModule,
    PaymentsModule,
    InventoryModule,
    OrdersModule,
    ReportsModule,
    AdminModule,
    SimulationModule,
    AcmeMcpModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
