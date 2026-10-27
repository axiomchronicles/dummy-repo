import {
  Injectable,
  type NestInterceptor,
  type ExecutionContext,
  type CallHandler,
} from '@nestjs/common';
import type { Request } from 'express';
import { map } from 'rxjs/operators';
import type { Observable } from 'rxjs';
import { routes } from './openapi';
import { DomainError } from './common';
const operations = routes.map((route) => ({
  ...route,
  pattern: new RegExp(
    `^/api/v1${route.path.replace(/\{[^}]+\}/g, '[^/]+')}/?$`,
  ),
}));
@Injectable()
export class ResponseContractInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<Request>();
    const operation = operations.find(
      (route) =>
        route.method === request.method.toLowerCase() &&
        route.pattern.test(request.path),
    );
    if (
      !operation ||
      operation.stream ||
      operation.binary ||
      request.headers.accept?.includes('text/event-stream') ||
      request.path.endsWith('/stream')
    )
      return next.handle();
    return next.handle().pipe(
      map((value) => {
        const result = operation.output.safeParse(value);
        if (!result.success) {
          process.stderr.write(
            `response contract failed: ${operation.method} ${operation.path}\n`,
          );
          throw new DomainError(
            'RESPONSE_CONTRACT_ERROR',
            'The operation returned invalid data; inspect service health',
            500,
          );
        }
        return value;
      }),
    );
  }
}
