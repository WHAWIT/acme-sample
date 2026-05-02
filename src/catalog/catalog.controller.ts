import { Controller, Get, NotFoundException, Param, Query } from '@nestjs/common';
import { createLogger } from '../common/logger';
import { CatalogService, Product } from './catalog.service';
import { SkuValidator } from './sku.validator';

const log = createLogger('catalog-controller');

@Controller('api/products')
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get()
  listProducts(@Query('category') category?: string): Product[] {
    const products = this.catalog.listProducts(category);
    log.debug(
      { event: 'products_listed', category: category ?? 'all', resultCount: products.length },
      'Listed catalog products',
    );
    return products;
  }

  @Get(':sku')
  getProduct(@Param('sku') sku: string): Product {
    if (!SkuValidator.isValid(sku)) {
      log.warn({ event: 'sku_malformed', sku }, `Rejected malformed SKU '${sku}'`);
      throw new NotFoundException(`Unknown SKU: ${sku}`);
    }
    const product = this.catalog.getProduct(sku);
    if (!product) {
      throw new NotFoundException(`Unknown SKU: ${sku}`);
    }
    return product;
  }
}
