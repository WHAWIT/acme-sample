import { Module } from '@nestjs/common';
import { OrdersModule } from '../orders/orders.module';
import { CatalogModule } from '../catalog/catalog.module';
import { InfraModule } from '../infra/infra.module';
import { CacheModule } from '../cache/cache.module';
import { OrderGeneratorService } from './order-generator.service';
import { SelfTrafficService } from './self-traffic.service';
import { MetricsSnapshotService } from './metrics-snapshot.service';

@Module({
  imports: [OrdersModule, CatalogModule, InfraModule, CacheModule],
  providers: [OrderGeneratorService, SelfTrafficService, MetricsSnapshotService],
})
export class SimulationModule {}
