import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, tap, catchError, throwError } from 'rxjs';
import { createLogger } from './logger';
import { newRequestId } from './ids';

const log = createLogger('http');

@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest();
    const res = context.switchToHttp().getResponse();
    const started = Date.now();
    const requestId = req.headers['x-request-id'] || newRequestId();

    const finish = (statusCode: number, err?: Error) => {
      const durationMs = Date.now() - started;
      const line = {
        event: 'http_request',
        requestId,
        method: req.method,
        path: req.originalUrl ?? req.url,
        status: statusCode,
        durationMs,
      };
      const message = `${req.method} ${line.path} ${statusCode} ${durationMs}ms`;
      if (statusCode >= 500) log.error({ ...line, err }, message);
      else if (statusCode >= 400 || durationMs > 3000) log.warn(line, message);
      else log.info(line, message);
    };

    return next.handle().pipe(
      tap(() => finish(res.statusCode)),
      catchError((err) => {
        finish(err?.status ?? 500, err);
        return throwError(() => err);
      }),
    );
  }
}
