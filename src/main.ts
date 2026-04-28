import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { LoggingInterceptor } from './common/logging.interceptor';
import { createLogger } from './common/logger';
import { runtimeState } from './common/runtime-state';

const log = createLogger('order-service');

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { logger: false });
  app.useGlobalInterceptors(new LoggingInterceptor());

  const port = Number(process.env.PORT || 8080);
  await app.listen(port);
  log.info(
    { event: 'service_started', port, version: runtimeState.version },
    `ACME order service listening on :${port} (v${runtimeState.version})`,
  );
}

bootstrap().catch((err) => {
  log.fatal({ err, event: 'service_start_failed' }, 'Failed to start ACME order service');
  process.exit(1);
});
