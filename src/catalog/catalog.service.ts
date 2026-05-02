import { Injectable } from '@nestjs/common';
import { createLogger } from '../common/logger';
import { FailureCode } from '../domain/failure-codes';
import { SkuValidator } from './sku.validator';

const log = createLogger('catalog-service');

export interface Product {
  sku: string;
  name: string;
  category: string;
  unitPrice: number;
  weightKg: number;
}

interface ProductLine {
  code: string;
  noun: string;
  /** Supplier-assigned starting variant serial for the line. */
  firstVariant: number;
  unitPrice: number;
  weightKg: number;
}

interface CategorySeed {
  category: string;
  prefix: string;
  lines: ProductLine[];
}

const VARIANT_FINISHES = ['Onyx', 'Birch', 'Slate', 'Terracotta', 'Fern'];

const CATALOG_SEED: CategorySeed[] = [
  {
    category: 'coffee',
    prefix: 'CFE',
    lines: [
      { code: 'MUG', noun: 'Ceramic Mug', firstVariant: 1, unitPrice: 11.5, weightKg: 0.38 },
      { code: 'BNS', noun: 'Single-Origin Beans 340g', firstVariant: 10, unitPrice: 15.0, weightKg: 0.4 },
      { code: 'GRD', noun: 'Conical Burr Grinder', firstVariant: 20, unitPrice: 74.0, weightKg: 1.9 },
      { code: 'PRS', noun: 'French Press', firstVariant: 1, unitPrice: 29.0, weightKg: 0.85 },
      { code: 'FLT', noun: 'Pour-Over Filters (100 ct)', firstVariant: 30, unitPrice: 6.5, weightKg: 0.15 },
      { code: 'KTL', noun: 'Gooseneck Kettle', firstVariant: 5, unitPrice: 55.0, weightKg: 1.25 },
      { code: 'TMB', noun: 'Insulated Travel Tumbler', firstVariant: 12, unitPrice: 23.0, weightKg: 0.42 },
      { code: 'SCL', noun: 'Precision Brew Scale', firstVariant: 1, unitPrice: 39.0, weightKg: 0.55 },
    ],
  },
  {
    category: 'electronics',
    prefix: 'ELC',
    lines: [
      { code: 'KBD', noun: 'Mechanical Keyboard', firstVariant: 40, unitPrice: 96.0, weightKg: 1.05 },
      { code: 'MSE', noun: 'Wireless Mouse', firstVariant: 10, unitPrice: 34.0, weightKg: 0.11 },
      { code: 'MON', noun: '27" QHD Monitor', firstVariant: 20, unitPrice: 259.0, weightKg: 5.6 },
      { code: 'HUB', noun: 'USB-C Hub', firstVariant: 1, unitPrice: 42.0, weightKg: 0.14 },
      { code: 'SPK', noun: 'Bluetooth Speaker', firstVariant: 30, unitPrice: 59.0, weightKg: 0.68 },
      { code: 'CAM', noun: '1080p Webcam', firstVariant: 15, unitPrice: 49.0, weightKg: 0.16 },
      { code: 'CHG', noun: '65W GaN Charger', firstVariant: 5, unitPrice: 36.0, weightKg: 0.13 },
      { code: 'HDP', noun: 'Over-Ear Headphones', firstVariant: 60, unitPrice: 129.0, weightKg: 0.31 },
    ],
  },
  {
    category: 'home',
    prefix: 'HOM',
    lines: [
      { code: 'LMP', noun: 'Ceramic Table Lamp', firstVariant: 1, unitPrice: 48.0, weightKg: 1.7 },
      { code: 'PLW', noun: 'Linen Throw Pillow', firstVariant: 10, unitPrice: 26.0, weightKg: 0.55 },
      { code: 'BLK', noun: 'Waffle-Knit Throw Blanket', firstVariant: 1, unitPrice: 44.0, weightKg: 1.3 },
      { code: 'VAS', noun: 'Stoneware Vase', firstVariant: 20, unitPrice: 31.0, weightKg: 1.1 },
      { code: 'ORG', noun: 'Bamboo Drawer Organizer', firstVariant: 5, unitPrice: 18.0, weightKg: 0.7 },
      { code: 'TWL', noun: 'Turkish Towel Set', firstVariant: 1, unitPrice: 38.0, weightKg: 1.0 },
      { code: 'CND', noun: 'Soy Candle 250g', firstVariant: 40, unitPrice: 16.0, weightKg: 0.34 },
      { code: 'RUG', noun: 'Flatweave Wool Rug 5x8', firstVariant: 1, unitPrice: 189.0, weightKg: 6.8 },
    ],
  },
  {
    category: 'apparel',
    prefix: 'APR',
    lines: [
      { code: 'TEE', noun: 'Organic Cotton Tee', firstVariant: 1, unitPrice: 19.0, weightKg: 0.2 },
      { code: 'HDY', noun: 'Midweight Fleece Hoodie', firstVariant: 10, unitPrice: 54.0, weightKg: 0.65 },
      { code: 'SCK', noun: 'Merino Hiking Socks', firstVariant: 20, unitPrice: 14.0, weightKg: 0.09 },
      { code: 'CAP', noun: 'Canvas Field Cap', firstVariant: 1, unitPrice: 22.0, weightKg: 0.12 },
      { code: 'JKT', noun: 'Packable Rain Shell', firstVariant: 30, unitPrice: 89.0, weightKg: 0.4 },
      { code: 'BLT', noun: 'Full-Grain Leather Belt', firstVariant: 1, unitPrice: 35.0, weightKg: 0.28 },
      { code: 'GLV', noun: 'Knit Touchscreen Gloves', firstVariant: 5, unitPrice: 17.0, weightKg: 0.08 },
      { code: 'SHT', noun: 'Brushed Oxford Shirt', firstVariant: 15, unitPrice: 46.0, weightKg: 0.3 },
    ],
  },
  {
    category: 'outdoors',
    prefix: 'OUT',
    lines: [
      { code: 'TNT', noun: '2-Person Backpacking Tent', firstVariant: 1, unitPrice: 219.0, weightKg: 2.3 },
      { code: 'SLP', noun: '20F Down Sleeping Bag', firstVariant: 10, unitPrice: 119.0, weightKg: 1.4 },
      { code: 'LNT', noun: 'Rechargeable LED Lantern', firstVariant: 1, unitPrice: 27.0, weightKg: 0.42 },
      { code: 'BTL', noun: 'Insulated Steel Bottle 1L', firstVariant: 20, unitPrice: 24.0, weightKg: 0.36 },
      { code: 'PCK', noun: '24L Daypack', firstVariant: 5, unitPrice: 68.0, weightKg: 0.85 },
      { code: 'CHR', noun: 'Compact Camp Chair', firstVariant: 1, unitPrice: 47.0, weightKg: 1.1 },
      { code: 'STV', noun: 'Canister Backpacking Stove', firstVariant: 30, unitPrice: 44.0, weightKg: 0.1 },
      { code: 'HMK', noun: 'Ripstop Camping Hammock', firstVariant: 15, unitPrice: 39.0, weightKg: 0.72 },
    ],
  },
];

/**
 * Imported lines keep the supplier's own SKU prefixes rather than our
 * category prefixes; they are priced and shipped like any other product.
 */
const IMPORTED_PRODUCTS: Product[] = [
  { sku: 'PEÑ-SET-01', name: 'Peñalara Trail Cookware Set — 4 pc', category: 'outdoors', unitPrice: 84.5, weightKg: 1.85 },
  { sku: 'PEÑ-SET-02', name: 'Peñalara Trail Cookware Set — 6 pc', category: 'outdoors', unitPrice: 109.0, weightKg: 2.6 },
];

const round2 = (n: number) => Math.round(n * 100) / 100;

@Injectable()
export class CatalogService {
  private readonly products: Product[] = [];
  private readonly bySku = new Map<string, Product>();

  constructor() {
    for (const group of CATALOG_SEED) {
      for (const line of group.lines) {
        for (let i = 0; i < VARIANT_FINISHES.length; i++) {
          const serial = String(line.firstVariant + i).padStart(2, '0');
          this.products.push({
            sku: `${group.prefix}-${line.code}-${serial}`,
            name: `${line.noun} — ${VARIANT_FINISHES[i]}`,
            category: group.category,
            unitPrice: round2(line.unitPrice * (1 + i * 0.05)),
            weightKg: line.weightKg,
          });
        }
      }
    }
    this.products.push(...IMPORTED_PRODUCTS);
    for (const product of this.products) {
      this.bySku.set(product.sku, product);
    }
    log.info(
      {
        event: 'catalog_seeded',
        productCount: this.products.length,
        categories: [...new Set(this.products.map((p) => p.category))],
      },
      `Product catalog seeded with ${this.products.length} products`,
    );
  }

  listProducts(category?: string): Product[] {
    if (!category) {
      return [...this.products];
    }
    return this.products.filter((p) => p.category === category);
  }

  getProduct(sku: string): Product | undefined {
    const canonical = SkuValidator.canonicalize(sku);
    const product = this.bySku.get(canonical);
    if (!product) {
      log.warn(
        { event: 'sku_not_found', errorCode: FailureCode.InvalidSku, sku: canonical },
        `SKU '${canonical}' not found in catalog`,
      );
      return undefined;
    }
    return product;
  }

  randomSku(): string {
    return this.products[Math.floor(Math.random() * this.products.length)].sku;
  }
}
