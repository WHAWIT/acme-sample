import { Module } from '@nestjs/common';
import { CacheModule } from '../cache/cache.module';
import { InfraModule } from '../infra/infra.module';
import { OrdersModule } from '../orders/orders.module';
import { AdminController } from './admin.controller';
import { AdminTokenGuard } from './admin-token.guard';

@Module({
  imports: [OrdersModule, InfraModule, CacheModule],
  controllers: [AdminController],
  providers: [AdminTokenGuard],
})
export class AdminModule {}
