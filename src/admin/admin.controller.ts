import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ProductCache } from '../cache/product-cache';
import { createLogger } from '../common/logger';
import { runtimeState } from '../common/runtime-state';
import { DbPool } from '../infra/db-pool';
import { OrderRepository } from '../orders/order.repository';
import { ScenarioEngine } from '../scenarios/scenario.engine';
import { Intensity, ScenarioName } from '../scenarios/scenario.types';
import { simConfig } from '../simulation/sim-config';
import { AdminTokenGuard } from './admin-token.guard';

const log = createLogger('admin');

@Controller('admin')
@UseGuards(AdminTokenGuard)
export class AdminController {
  constructor(
    private readonly engine: ScenarioEngine,
    private readonly repository: OrderRepository,
    private readonly dbPool: DbPool,
    private readonly productCache: ProductCache,
  ) {}

  @Get('scenarios')
  listScenarios() {
    const now = Date.now();
    return this.engine.list().map((s) => ({
      name: s.name,
      description: s.description,
      defaultDurationMinutes: s.defaultDurationMinutes,
      active: !!s.activation,
      intensity: s.activation?.intensity,
      startedAt: s.activation?.startedAt,
      expiresAt: s.activation?.expiresAt,
      remainingSeconds: s.activation
        ? Math.max(0, Math.round((s.activation.expiresAt.getTime() - now) / 1000))
        : 0,
    }));
  }

  @Post('scenarios/:name/start')
  startScenario(
    @Param('name') name: string,
    @Body() body: { durationMinutes?: number; intensity?: Intensity },
  ) {
    try {
      return this.engine.start(name as ScenarioName, body ?? {});
    } catch (err) {
      throw new BadRequestException(err.message);
    }
  }

  @Post('scenarios/:name/stop')
  stopScenario(@Param('name') name: string) {
    return { stopped: this.engine.stop(name as ScenarioName) };
  }

  @Post('scenarios/stop-all')
  stopAll() {
    return { stopped: this.engine.stopAll() };
  }

  @Post('config')
  updateConfig(
    @Body()
    body: {
      orderRatePerMin?: number;
      queryRatePerMin?: number;
      baselineNoise?: boolean;
    },
  ) {
    if (body?.orderRatePerMin !== undefined) {
      simConfig.orderRatePerMin = Number(body.orderRatePerMin);
    }
    if (body?.queryRatePerMin !== undefined) {
      simConfig.queryRatePerMin = Number(body.queryRatePerMin);
    }
    if (body?.baselineNoise !== undefined) {
      simConfig.baselineNoise = !!body.baselineNoise;
    }
    log.info(
      { event: 'sim_config_updated', ...simConfig },
      'Simulation config updated',
    );
    return simConfig;
  }

  @Get('status')
  status() {
    return {
      version: runtimeState.version,
      uptimeSeconds: Math.round(process.uptime()),
      config: simConfig,
      scenariosActive: this.engine
        .list()
        .filter((s) => s.activation)
        .map((s) => s.name),
      orders: {
        byState: this.repository.countsByState(),
        today: this.repository.totalToday(),
        active: this.repository.activeCount(),
      },
      pool: this.dbPool.stats(),
      cache: this.productCache.stats(),
    };
  }
}
