import { Module } from '@nestjs/common';
import { AdminTokenGuard } from '../admin/admin-token.guard';
import { InfraModule } from '../infra/infra.module';
import { OrdersModule } from '../orders/orders.module';
import { ScenariosModule } from '../scenarios/scenarios.module';
import { AcmeMcpController } from './acme-mcp.controller';
import { OpsToolsService } from './ops-tools.service';

@Module({
  imports: [ScenariosModule, InfraModule, OrdersModule],
  controllers: [AcmeMcpController],
  providers: [OpsToolsService, AdminTokenGuard],
})
export class AcmeMcpModule {}
