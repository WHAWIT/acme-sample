import { Module } from '@nestjs/common';
import { ProductCache } from './product-cache';

@Module({
  providers: [ProductCache],
  exports: [ProductCache],
})
export class CacheModule {}
