import { Injectable } from '@nestjs/common';
import { pool, transaction, appendAudit } from '@outreach/database';
import { AgentInputSchema } from '@outreach/contracts';
import { MockVoiceProvider } from '@outreach/voice-provider';
import { randomUUID } from 'node:crypto';
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
    await owned(pool, 'agents', id, identity.workspaceId);
    const mock = new MockVoiceProvider();
    return {
      mode: 'simulation',
      ...(await mock.initiate({
        localAttemptId: randomUUID(),
        phone: '+12025550100',
      })),
    };
  }
}
