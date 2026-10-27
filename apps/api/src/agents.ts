import { Injectable } from '@nestjs/common';
import { pool, transaction, appendAudit } from '@outreach/database';
import { AgentInputSchema } from '@outreach/contracts';
import { randomUUID } from 'node:crypto';
import { config } from './auth';
import {
  clean,
  owned,
  parse,
  requireWrite,
  pagination,
  paged,
  offsetCursor,
  type SessionIdentity,
} from './common';
const agentSelect =
  'SELECT a.*,v.id version_id,v.instructions prompt,v.questions,v.language FROM agents a JOIN agent_versions v ON v.agent_id=a.id AND v.workspace_id=a.workspace_id AND v.version=a.current_version';
@Injectable()
export class AgentsService {
  async list(
    identity: SessionIdentity,
    query: Record<string, unknown>,
  ): Promise<unknown> {
    const { limit, cursor } = pagination(query);
    const offset = offsetCursor(cursor);
    return paged(
      (
        await pool.query(
          `${agentSelect} WHERE a.workspace_id=$1 ORDER BY a.created_at,a.id LIMIT $2 OFFSET $3`,
          [identity.workspaceId, limit + 1, offset],
        )
      ).rows,
      limit,
      offset,
    );
  }
  async detail(identity: SessionIdentity, id: string): Promise<unknown> {
    await owned(pool, 'agents', id, identity.workspaceId);
    return clean(
      (
        await pool.query(`${agentSelect} WHERE a.workspace_id=$1 AND a.id=$2`, [
          identity.workspaceId,
          id,
        ])
      ).rows[0],
    );
  }
  async versions(identity: SessionIdentity, id: string): Promise<unknown> {
    await owned(pool, 'agents', id, identity.workspaceId);
    return {
      items: clean(
        (
          await pool.query(
            'SELECT id,version,instructions prompt,questions,language,created_at FROM agent_versions WHERE workspace_id=$1 AND agent_id=$2 ORDER BY version DESC',
            [identity.workspaceId, id],
          )
        ).rows,
      ),
      nextCursor: null,
    };
  }
  async save(
    identity: SessionIdentity,
    body: unknown,
    id?: string,
  ): Promise<unknown> {
    requireWrite(identity);
    const input = parse(AgentInputSchema, body);
    const agentId = await transaction(async (client) => {
      let agent;
      if (id) {
        const existing = await owned(
          client,
          'agents',
          id,
          identity.workspaceId,
          true,
        );
        agent = (
          await client.query(
            'UPDATE agents SET name=$1,description=$2,current_version=$3 WHERE id=$4 AND workspace_id=$5 RETURNING *',
            [
              input.name,
              input.description,
              existing.current_version + 1,
              id,
              identity.workspaceId,
            ],
          )
        ).rows[0];
      } else
        agent = (
          await client.query(
            'INSERT INTO agents(workspace_id,name,description) VALUES($1,$2,$3) RETURNING *',
            [identity.workspaceId, input.name, input.description],
          )
        ).rows[0];
      await client.query(
        'INSERT INTO agent_versions(workspace_id,agent_id,version,instructions,questions,language) VALUES($1,$2,$3,$4,$5,$6)',
        [
          identity.workspaceId,
          agent.id,
          agent.current_version,
          input.prompt,
          JSON.stringify(input.questions),
          input.language,
        ],
      );
      await appendAudit(
        client,
        identity.workspaceId,
        identity.userId,
        id ? 'agent.version_created' : 'agent.created',
        agent.id,
        { version: agent.current_version },
      );
      return agent.id;
    });
    return this.detail(identity, agentId);
  }
  async sandbox(identity: SessionIdentity, id: string): Promise<unknown> {
    const agent = await owned(pool, 'agents', id, identity.workspaceId);
    const version = (
      await pool.query(
        'SELECT * FROM agent_versions WHERE agent_id=$1 AND version=$2 AND workspace_id=$3',
        [id, agent.current_version, identity.workspaceId],
      )
    ).rows[0];

    const localAttemptId = randomUUID();
    const apiKey = config.OPENAI_API_KEY || config.OPENAI_COMPATIBLE_API_KEY;
    if (
      apiKey &&
      (config.MODEL_PROVIDER === 'openai' ||
        config.MODEL_PROVIDER === 'openai-compatible')
    ) {
      try {
        const baseURL = (
          config.OPENAI_BASE_URL || 'https://api.openai.com/v1'
        ).replace(/\/$/, '');
        const res = await fetch(`${baseURL}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model: config.OPENAI_MODEL || 'gpt-4o-mini',
            messages: [
              {
                role: 'system',
                content:
                  'You are a realistic conversational simulator for voice calling agents. Simulate a realistic 3-4 turn phone conversation between the agent and a contact. Respect the agent persona instructions, language, and questions. Return a JSON object with "transcript" (array of { "role": "agent"|"user", "text": string }) and "extractedFields" (key-value pairs of answers).',
              },
              {
                role: 'user',
                content: JSON.stringify({
                  personaName: agent.name,
                  instructions: version?.instructions || '',
                  questions: version?.questions || [],
                  language: version?.language || 'English',
                }),
              },
            ],
            temperature: 0.3,
            response_format: { type: 'json_object' },
          }),
          signal: AbortSignal.timeout(10000),
        });
        if (res.ok) {
          const json = (await res.json()) as {
            choices: Array<{ message: { content: string } }>;
          };
          const content = JSON.parse(json.choices[0]!.message.content) as {
            transcript?: Array<{ role: 'agent' | 'user'; text: string }>;
            extractedFields?: Record<string, unknown>;
          };
          if (
            Array.isArray(content.transcript) &&
            content.transcript.length > 0
          ) {
            return {
              mode: 'simulation',
              kind: 'terminal',
              event: {
                provider: 'mock',
                providerAttemptId: `sim-${localAttemptId}`,
                localAttemptId,
                outcome: 'connected',
                durationSeconds: 38,
                interactionId: `model-sandbox-${localAttemptId}`,
                failureCode: null,
                extractedFields: content.extractedFields || {},
                transcript: content.transcript,
                simulated: true,
              },
            };
          }
        }
      } catch {
        // Fall back to realistic dialogue below
      }
    }

    const questions = Array.isArray(version?.questions)
      ? version.questions
      : ['How can we assist you today?'];
    const firstQ = questions[0] || 'How can we assist you today?';
    return {
      mode: 'simulation',
      kind: 'terminal',
      event: {
        provider: 'mock',
        providerAttemptId: `sim-${localAttemptId}`,
        localAttemptId,
        outcome: 'connected',
        durationSeconds: 42,
        interactionId: `sim-${localAttemptId}`,
        failureCode: null,
        extractedFields: {
          interest: 'confirmed',
          followUpRequested: true,
          preferredTime: 'Morning',
        },
        transcript: [
          {
            role: 'agent',
            text: `Hello, I am calling from ${agent.name}. ${firstQ}`,
          },
          {
            role: 'user',
            text: 'Yes, thank you for reaching out. I would like to confirm my participation.',
          },
          {
            role: 'agent',
            text: 'Thank you for confirming. We have recorded your responses and will follow up.',
          },
        ],
        simulated: true,
      },
    };
  }
}
