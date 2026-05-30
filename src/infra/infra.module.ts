import { Module } from '@nestjs/common';
import { DbPool } from './db-pool';

@Module({
  providers: [DbPool],
  exports: [DbPool],
})
export class InfraModule {}
