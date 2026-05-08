import { Module } from '@nestjs/common';
import { DiscountService } from './discount.service';
import { PricingService } from './pricing.service';

@Module({
  providers: [PricingService, DiscountService],
  exports: [PricingService, DiscountService],
})
export class PricingModule {}
