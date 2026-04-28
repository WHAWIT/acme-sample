import { Controller, Get } from '@nestjs/common';
import { runtimeState } from '../common/runtime-state';

@Controller()
export class HealthController {
  @Get(['health', 'healthz'])
  health() {
    return {
      status: 'ok',
      version: runtimeState.version,
      uptime: process.uptime(),
    };
  }
}
