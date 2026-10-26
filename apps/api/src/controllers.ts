import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Req,
  Res,
  Inject,
  UseGuards,
  HttpCode,
} from '@nestjs/common';
import type { Response, Request } from 'express';
import { AuthService, SessionGuard, verifyOrigin } from './auth';
import { ImportsService } from './imports';
import { AgentsService } from './agents';
import { CampaignsService } from './campaigns';
import { OperationsService } from './operations';
import { WebhooksService } from './webhooks';
import { idempotencyKey, type AuthenticatedRequest } from './common';
import { openApiDocument } from './openapi';
import { StreamsService } from './streams';

@Controller('api/v1/auth')
export class AuthController {
  constructor(@Inject(AuthService) private readonly auth: AuthService) {}
  @Post('demo') @HttpCode(200) demo(
    @Body() body: unknown,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    verifyOrigin(req);
    return this.auth.signIn(body, res);
  }
  @Post('logout') @HttpCode(200) logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    verifyOrigin(req);
    return this.auth.logout(req, res);
  }
}
@Controller('api/v1')
@UseGuards(SessionGuard)
export class WorkspaceController {
  constructor(
    @Inject(OperationsService) private readonly service: OperationsService,
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(StreamsService) private readonly streams: StreamsService,
  ) {}
  @Get('me') me(@Req() req: AuthenticatedRequest) {
    return this.service.me(req.identity);
  }
  @Get('overview') overview(@Req() req: AuthenticatedRequest) {
    return this.service.overview(req.identity);
  }
  @Get('integrations') integrations() {
    return this.service.integrations();
  }
  @Get('settings') settings(@Req() req: AuthenticatedRequest) {
    return this.service.settings(req.identity);
  }
  @Patch('settings') settingsUpdate(
    @Req() req: AuthenticatedRequest,
    @Body() body: unknown,
  ) {
    return this.service.updateSettings(req.identity, body);
  }
  @Get('audit') audit(
    @Req() req: AuthenticatedRequest,
    @Query() query: Record<string, unknown>,
  ) {
    return this.service.audit(req.identity, query);
  }
  @Get('reports') reports(
    @Req() req: AuthenticatedRequest,
    @Query() query: Record<string, unknown>,
  ) {
    return this.service.reports(req.identity, query);
  }
  @Get('reports/:id/download') download(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    return this.service.download(req.identity, id, res);
  }
  @Post('campaigns/:id/reports') @HttpCode(202) report(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.service.requestReport(
      req.identity,
      id,
      body,
      idempotencyKey(req),
    );
  }
  @Get('events') events(
    @Req() req: AuthenticatedRequest,
    @Query() query: Record<string, unknown>,
  ) {
    return this.service.events(req.identity, query);
  }
  @Get('campaigns/:id/events') campaignEvents(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Query() query: Record<string, unknown>,
  ) {
    return this.service.events(req.identity, query, id);
  }
  @Get('campaigns/:id/stream') async stream(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Query() query: Record<string, unknown>,
    @Res() res: Response,
  ) {
    let cursor = req.get('Last-Event-ID') || String(query.after || '0');
    await this.service.events(req.identity, { after: cursor, limit: 1 }, id);
    let closed = false;
    const release = this.streams.register(res, () => {
      closed = true;
    });
    try {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders();
      let lastHeartbeat = 0;
      let lastAuthorization = Date.now();
      while (!closed) {
        try {
          if (Date.now() - lastAuthorization > 30000) {
            const active = await this.auth.identity(req);
            if (active.workspaceId !== req.identity.workspaceId) break;
            lastAuthorization = Date.now();
          }
          const result = (await this.service.events(
            req.identity,
            { after: cursor, limit: 100 },
            id,
          )) as { items: { id: string }[]; nextCursor: string };
          if (closed || res.writableEnded) break;
          for (const event of result.items) {
            if (
              !res.write(`id: ${event.id}\ndata: ${JSON.stringify(event)}\n\n`)
            ) {
              closed = true;
              break;
            }
            cursor = event.id;
          }
          if (Date.now() - lastHeartbeat > 15000) {
            res.write(': heartbeat\n\n');
            lastHeartbeat = Date.now();
          }
        } catch {
          if (!closed && !res.writableEnded)
            res.write(
              'event: reconnect\ndata: {"reason":"dependency_unavailable"}\n\n',
            );
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 750));
      }
    } finally {
      release();
      if (!res.writableEnded) res.end();
    }
  }
}
@Controller('api/v1/agents')
@UseGuards(SessionGuard)
export class AgentsController {
  constructor(@Inject(AgentsService) private readonly service: AgentsService) {}
  @Get() list(
    @Req() req: AuthenticatedRequest,
    @Query() query: Record<string, unknown>,
  ) {
    return this.service.list(req.identity, query);
  }
  @Post() create(@Req() req: AuthenticatedRequest, @Body() body: unknown) {
    return this.service.save(req.identity, body);
  }
  @Get(':id') detail(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    return this.service.detail(req.identity, id);
  }
  @Patch(':id') edit(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.service.save(req.identity, body, id);
  }
  @Get(':id/versions') versions(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    return this.service.versions(req.identity, id);
  }
  @Post(':id/sandbox') @HttpCode(200) sandbox(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    return this.service.sandbox(req.identity, id);
  }
}
@Controller('api/v1')
@UseGuards(SessionGuard)
export class ImportsController {
  constructor(
    @Inject(ImportsService) private readonly service: ImportsService,
  ) {}
  @Get('imports') list(
    @Req() req: AuthenticatedRequest,
    @Query() query: Record<string, unknown>,
  ) {
    return this.service.list(req.identity, query);
  }
  @Post('imports') @HttpCode(202) create(
    @Req() req: AuthenticatedRequest,
    @Body() body: unknown,
  ) {
    return this.service.create(req.identity, body);
  }
  @Get('imports/:id') detail(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    return this.service.detail(req.identity, id);
  }
  @Get('imports/:id/rows') rows(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Query() query: Record<string, unknown>,
  ) {
    return this.service.rows(req.identity, id, query);
  }
  @Post('imports/:id/validate') @HttpCode(202) validate(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.service.validate(req.identity, id, body);
  }
  @Get('contacts') contacts(
    @Req() req: AuthenticatedRequest,
    @Query() query: Record<string, unknown>,
  ) {
    return this.service.contacts(req.identity, query);
  }
  @Post('contacts/:id/suppress') @HttpCode(200) suppress(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.service.suppress(req.identity, id, body);
  }
}
@Controller('api/v1')
@UseGuards(SessionGuard)
export class CampaignsController {
  constructor(
    @Inject(CampaignsService) private readonly service: CampaignsService,
  ) {}
  @Get('campaigns') list(
    @Req() req: AuthenticatedRequest,
    @Query() query: Record<string, unknown>,
  ) {
    return this.service.list(req.identity, query);
  }
  @Post('campaigns') create(
    @Req() req: AuthenticatedRequest,
    @Body() body: unknown,
  ) {
    return this.service.create(req.identity, body);
  }
  @Get('campaigns/:id') detail(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    return this.service.detail(req.identity, id);
  }
  @Patch('campaigns/:id') edit(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.service.edit(req.identity, id, body);
  }
  @Delete('campaigns/:id') remove(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    return this.service.action(req.identity, id, 'cancel');
  }
  @Post('campaigns/:id/plan') @HttpCode(200) plan(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    return this.service.plan(req.identity, id);
  }
  @Post('campaigns/:id/simulate') @HttpCode(200) simulate(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.service.launch(
      req.identity,
      id,
      body,
      idempotencyKey(req),
      'simulation',
    );
  }
  @Post('campaigns/:id/launch') @HttpCode(200) launch(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: unknown,
  ) {
    return this.service.launch(
      req.identity,
      id,
      body,
      idempotencyKey(req),
      'live',
    );
  }
  @Post('campaigns/:id/pause') @HttpCode(200) pause(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    return this.service.action(req.identity, id, 'pause');
  }
  @Post('campaigns/:id/resume') @HttpCode(200) resume(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    return this.service.action(req.identity, id, 'resume');
  }
  @Post('campaigns/:id/cancel') @HttpCode(200) cancel(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    return this.service.action(req.identity, id, 'cancel');
  }
  @Get('campaigns/:id/contacts') contacts(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Query() query: Record<string, unknown>,
  ) {
    return this.service.contacts(req.identity, id, query);
  }
  @Get('campaigns/:id/attempts') attempts(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Query() query: Record<string, unknown>,
  ) {
    return this.service.attempts(req.identity, id, query);
  }
  @Get('calls/:id') call(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
  ) {
    return this.service.call(req.identity, id);
  }
}
@Controller('api/v1')
export class PublicController {
  constructor(
    @Inject(WebhooksService) private readonly webhooks: WebhooksService,
  ) {}
  @Get('openapi.json') openapi() {
    return openApiDocument();
  }
  @Post('webhooks/sarvam/:token') @HttpCode(200) webhook(
    @Param('token') token: string,
    @Body() body: unknown,
  ) {
    return this.webhooks.receive(token, body);
  }
}
