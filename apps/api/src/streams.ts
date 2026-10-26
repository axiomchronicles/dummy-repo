import { Injectable, type BeforeApplicationShutdown } from '@nestjs/common';
import type { Response } from 'express';
import { DomainError } from './common';

@Injectable()
export class StreamsService implements BeforeApplicationShutdown {
  private readonly active = new Map<Response, () => void>();
  private shuttingDown = false;

  register(response: Response, stop: () => void): () => void {
    if (this.shuttingDown)
      throw new DomainError(
        'SHUTTING_DOWN',
        'Reconnect when the API is ready',
        503,
      );
    const closed = () => {
      stop();
      this.active.delete(response);
    };
    this.active.set(response, stop);
    response.once('close', closed);
    return () => {
      this.active.delete(response);
      response.off('close', closed);
    };
  }

  beforeApplicationShutdown(): void {
    this.shuttingDown = true;
    for (const [response, stop] of this.active) {
      stop();
      if (!response.writableEnded && !response.destroyed) {
        response.write(
          'event: reconnect\ndata: {"reason":"server_shutdown"}\n\n',
        );
        response.end();
      }
    }
    this.active.clear();
  }
}
