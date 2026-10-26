import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import {
  Module,
  Controller,
  Get,
  Injectable,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { json, type Request, type Response, type NextFunction } from 'express';
import IORedis from 'ioredis';
import { pool, waitForDatabase } from '@outreach/database';
import { config, AuthService, SessionGuard } from './auth';
import {
  AuthController,
  WorkspaceController,
  AgentsController,
  ImportsController,
  CampaignsController,
  PublicController,
} from './controllers';
import { AgentsService } from './agents';
import { ImportsService } from './imports';
import { CampaignsService } from './campaigns';
import { OperationsService } from './operations';
import { WebhooksService } from './webhooks';
import { SafeExceptionFilter, DomainError } from './common';
import { ResponseContractInterceptor } from './response-contracts';
import { StreamsService } from './streams';
import { CampaignContentPlanner } from '@outreach/voice-provider';

const redis = new IORedis(config.REDIS_URL, {
  maxRetriesPerRequest: 1,
  enableOfflineQueue: false,
  retryStrategy: (attempt) => Math.min(attempt * 200, 3000),
});
redis.on('error', () => {});
@Controller('health')
class HealthController {
  @Get('live') live() {
    return { status: 'alive' };
  }
  @Get('ready') async ready() {
    try {
      await Promise.all([
        pool.query('SELECT 1 FROM campaigns LIMIT 1'),
        redis.ping(),
      ]);
      return { status: 'ready', database: true, redis: true };
    } catch {
      throw new DomainError(
        'NOT_READY',
        'Database schema or queue connection is unavailable',
        503,
      );
    }
  }
}
@Injectable()
class ResourceCleanup implements OnApplicationShutdown {
  async onApplicationShutdown(): Promise<void> {
    redis.disconnect();
    await pool.end();
  }
}
@Module({
  controllers: [
    HealthController,
    AuthController,
    WorkspaceController,
    AgentsController,
    ImportsController,
    CampaignsController,
    PublicController,
  ],
  providers: [
    ResourceCleanup,
    {
      provide: CampaignContentPlanner,
      useFactory: () => new CampaignContentPlanner(config),
    },
    StreamsService,
    AuthService,
    SessionGuard,
    AgentsService,
    ImportsService,
    CampaignsService,
    OperationsService,
    WebhooksService,
  ],
})
class AppModule {}
async function bootstrap(): Promise<void> {
  await waitForDatabase();
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log'],
    bodyParser: false,
  });
  app.use(json({ limit: '7mb', strict: true }));
  app.use((req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  const buckets = new Map<string, { count: number; reset: number }>();
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (
      !req.path.startsWith('/api/v1/auth') &&
      !req.path.startsWith('/api/v1/webhooks')
    )
      return next();
    const key = `${req.ip}:${req.path.startsWith('/api/v1/auth') ? 'auth' : 'webhook'}`;
    const now = Date.now();
    let bucket = buckets.get(key);
    if (!bucket || bucket.reset < now) {
      bucket = { count: 0, reset: now + 60000 };
      buckets.set(key, bucket);
    }
    bucket.count++;
    if (buckets.size > 10000)
      for (const [candidate, value] of buckets)
        if (value.reset < now) buckets.delete(candidate);
    if (bucket.count > (req.path.startsWith('/api/v1/auth') ? 30 : 200))
      return res.status(429).json({
        error: {
          code: 'RATE_LIMITED',
          message: 'Retry after the current minute',
        },
      });
    next();
  });
  app.useGlobalFilters(new SafeExceptionFilter());
  app.useGlobalInterceptors(new ResponseContractInterceptor());
  app.enableShutdownHooks();
  await app.listen(config.API_PORT, '0.0.0.0');
}
void bootstrap().catch(() => {
  process.stderr.write(
    'API startup failed; verify configuration and database readiness\n',
  );
  process.exitCode = 1;
  redis.disconnect();
  void pool.end();
});
