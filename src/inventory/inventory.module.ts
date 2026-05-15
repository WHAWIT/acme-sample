import { Module } from '@nestjs/common';
import { CacheModule } from '../cache/cache.module';
import { InventoryService } from './inventory.service';
import { StockAllocator, StockLedger } from './stock-allocator';

@Module({
  imports: [CacheModule],
  providers: [StockLedger, InventoryService, StockAllocator],
  exports: [InventoryService, StockAllocator],
})
export class InventoryModule {}
