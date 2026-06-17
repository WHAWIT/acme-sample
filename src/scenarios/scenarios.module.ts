import { Global, Module, OnModuleInit } from '@nestjs/common';
import { ScenarioEngine } from './scenario.engine';
import { registerAllScenarios } from './definitions';
import { InfraModule } from '../infra/infra.module';
import { DbPool } from '../infra/db-pool';

@Global()
@Module({
  imports: [InfraModule],
  providers: [ScenarioEngine],
  exports: [ScenarioEngine],
})
export class ScenariosModule implements OnModuleInit {
  constructor(
    private readonly engine: ScenarioEngine,
    private readonly dbPool: DbPool,
  ) {}

  onModuleInit(): void {
    registerAllScenarios(this.engine, { dbPool: this.dbPool });
  }
}
