import { Body, Controller, Get, Headers, Param, Post, Query } from '@nestjs/common';
import { CreateOrderDto, OrdersService } from './orders.service';

@Controller('api')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Post('orders')
  createOrder(@Body() dto: CreateOrderDto, @Headers('idempotency-key') idempotencyKey?: string) {
    return this.orders.createOrder(dto, idempotencyKey);
  }

  @Get('orders/:id/tracking')
  tracking(@Param('id') id: string) {
    return this.orders.tracking(id);
  }

  @Get('orders/:id')
  getOrder(@Param('id') id: string) {
    return this.orders.getOrder(id);
  }

  @Get('orders')
  listOrders(
    @Query('customerId') customerId?: string,
    @Query('state') state?: string,
    @Query('limit') limit?: string,
  ) {
    return this.orders.listOrders({
      customerId,
      state,
      limit: limit ? Number(limit) : undefined,
    });
  }

  @Post('checkout/quote')
  quote(@Body() dto: CreateOrderDto) {
    return this.orders.quote(dto);
  }
}
