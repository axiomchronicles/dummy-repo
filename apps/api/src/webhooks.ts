import { Injectable } from '@nestjs/common';
import { timingSafeEqual } from 'node:crypto';
import { transaction, enqueueOutbox, appendAudit } from '@outreach/database';
import { SarvamWebhookSchema } from '@outreach/contracts';
import { normalizeSarvamWebhook } from '@outreach/voice-provider';
import { config } from './auth';
import { DomainError, parse } from './common';
@Injectable()
export class WebhooksService {
  async receive(token: string, body: unknown): Promise<unknown> {
    const expected = config.SARVAM_WEBHOOK_TOKEN;
    if (
      !expected ||
      token.length !== expected.length ||
      !timingSafeEqual(Buffer.from(token), Buffer.from(expected))
    )
      throw new DomainError('NOT_FOUND', 'Webhook route not found', 404);
    const payload = parse(SarvamWebhookSchema, body);
    let event: ReturnType<typeof normalizeSarvamWebhook>;
    try {
      event = normalizeSarvamWebhook(payload);
    } catch {
      throw new DomainError(
        'INVALID_WEBHOOK',
        'Callback correlation or normalized values are invalid',
      );
    }
    if (!event.providerAttemptId)
      throw new DomainError(
        'INVALID_WEBHOOK',
        'Terminal callback must identify a provider attempt',
      );
    return transaction(async (client) => {
      let attempt = (
        await client.query(
          "SELECT * FROM call_attempts WHERE provider='sarvam' AND provider_attempt_id=$1 FOR UPDATE",
          [event.providerAttemptId],
        )
      ).rows[0];
      if (!attempt && event.localAttemptId)
        attempt = (
          await client.query(
            "SELECT * FROM call_attempts WHERE id=$1 AND provider='sarvam' AND status IN ('dispatching','accepted','unknown') FOR UPDATE",
            [event.localAttemptId],
          )
        ).rows[0];
      if (
        !attempt ||
        (attempt.provider_attempt_id &&
          attempt.provider_attempt_id !== event.providerAttemptId)
      )
        throw new DomainError(
          'UNKNOWN_ATTEMPT',
          'Callback does not match an initiated attempt',
          404,
        );
      if (!attempt.provider_attempt_id)
        await client.query(
          'UPDATE call_attempts SET provider_attempt_id=$1 WHERE id=$2 AND workspace_id=$3',
          [event.providerAttemptId, attempt.id, attempt.workspace_id],
        );
      const existing = (
        await client.query(
          "SELECT * FROM webhook_inbox WHERE provider='sarvam' AND provider_attempt_id=$1",
          [event.providerAttemptId],
        )
      ).rows[0];
      if (existing) {
        if (existing.payload.outcome !== event.outcome)
          await appendAudit(
            client,
            attempt.workspace_id,
            null,
            'webhook.contradictory_terminal',
            attempt.id,
            {
              storedOutcome: existing.payload.outcome,
              receivedOutcome: event.outcome,
            },
          );
        return { accepted: true, duplicate: true };
      }
      const row = (
        await client.query(
          "INSERT INTO webhook_inbox(workspace_id,provider,provider_attempt_id,local_attempt_id,payload) VALUES($1,'sarvam',$2,$3,$4) RETURNING id",
          [
            attempt.workspace_id,
            event.providerAttemptId,
            attempt.id,
            JSON.stringify(event),
          ],
        )
      ).rows[0];
      await enqueueOutbox(
        client,
        'reconciliation',
        { id: row.id },
        attempt.workspace_id,
      );
      return { accepted: true, duplicate: false };
    });
  }
}
