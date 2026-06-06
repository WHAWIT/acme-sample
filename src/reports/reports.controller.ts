import { Controller, GatewayTimeoutException, Get } from '@nestjs/common';
import { createLogger } from '../common/logger';
import { FailureCode } from '../domain/failure-codes';
import { ReportsService } from './reports.service';

const log = createLogger('order-service');

const REPORT_DEADLINE_MS = 10_000;

@Controller('api/reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('daily')
  async daily(): Promise<object> {
    let timer: NodeJS.Timeout;
    const deadline = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        const err = new Error(
          `Daily report exceeded ${REPORT_DEADLINE_MS}ms deadline`,
        );
        log.error(
          {
            event: 'report_generation_timeout',
            errorCode: FailureCode.UpstreamTimeout,
            deadlineMs: REPORT_DEADLINE_MS,
            err,
          },
          'Daily report generation timed out',
        );
        reject(new GatewayTimeoutException('Report generation timed out'));
      }, REPORT_DEADLINE_MS);
    });

    try {
      return await Promise.race([this.reports.dailyReport(), deadline]);
    } finally {
      clearTimeout(timer);
    }
  }
}
