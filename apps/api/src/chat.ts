import { Injectable } from '@nestjs/common';
import type { Response } from 'express';
import { pool, transaction, seedAgentPersonas } from '@outreach/database';
import { SendMessageRequestSchema } from '@outreach/contracts';
import { createHash } from 'node:crypto';
import { config } from './auth';
import { planningSnapshot } from './planning';
import type { StreamsService } from './streams';
import {
  DomainError,
  parse,
  pagination,
  paged,
  offsetCursor,
  clean,
  type SessionIdentity,
} from './common';

function resolveModelCredentials() {
  const envKey =
    config.OPENAI_COMPATIBLE_API_KEY ||
    process.env.OPENAI_COMPATIBLE_API_KEY ||
    config.OPENAI_API_KEY ||
    process.env.OPENAI_API_KEY;
  const apiKey =
    envKey && envKey !== 'your-openai-api-key-here' ? envKey : null;

  const envURL =
    config.OPENAI_COMPATIBLE_BASE_URL ||
    process.env.OPENAI_COMPATIBLE_BASE_URL ||
    config.OPENAI_BASE_URL ||
    process.env.OPENAI_BASE_URL ||
    'https://codex-relay.codes/v1';
  const baseURL = envURL.replace(/\/$/, '');

  const model =
    config.OPENAI_COMPATIBLE_MODEL_ID ||
    process.env.OPENAI_COMPATIBLE_MODEL_ID ||
    config.OPENAI_MODEL ||
    process.env.OPENAI_MODEL ||
    'gpt-6-luna';

  return { apiKey, baseURL, model };
}

@Injectable()
export class ChatService {
  async listThreads(
    identity: SessionIdentity,
    query: Record<string, unknown>,
  ): Promise<unknown> {
    const { limit, cursor } = pagination(query);
    const offset = offsetCursor(cursor);
    const result = await pool.query(
      `SELECT t.*,
        (SELECT count(*)::int FROM chat_messages m WHERE m.thread_id = t.id) as message_count
       FROM chat_threads t
       WHERE t.workspace_id = $1 AND t.user_id = $2
       ORDER BY t.updated_at DESC
       LIMIT $3 OFFSET $4`,
      [identity.workspaceId, identity.userId, limit + 1, offset],
    );
    return paged(result.rows, limit, offset);
  }

  async createThread(
    identity: SessionIdentity,
    title?: string,
  ): Promise<unknown> {
    const threadTitle = title?.trim() || 'New Outreach Task';
    const row = (
      await pool.query(
        `INSERT INTO chat_threads(workspace_id, user_id, title)
         VALUES($1, $2, $3)
         RETURNING *`,
        [identity.workspaceId, identity.userId, threadTitle],
      )
    ).rows[0];
    return clean(row);
  }

  async getMessages(
    identity: SessionIdentity,
    threadId: string,
  ): Promise<unknown> {
    const thread = (
      await pool.query(
        'SELECT id FROM chat_threads WHERE id = $1 AND workspace_id = $2 AND user_id = $3',
        [threadId, identity.workspaceId, identity.userId],
      )
    ).rows[0];
    if (!thread)
      throw new DomainError('THREAD_NOT_FOUND', 'Thread not found', 404);

    const rows = (
      await pool.query(
        'SELECT * FROM chat_messages WHERE thread_id = $1 ORDER BY created_at ASC',
        [threadId],
      )
    ).rows;
    return clean(rows);
  }

  private async buildSystemPrompt(workspaceId: string): Promise<{
    systemPrompt: string;
    agentRows: Array<{
      agent_id: string;
      name: string;
      description: string;
      version_id: string;
      instructions: string;
      questions: string[];
      language: string;
    }>;
    importRow?: { id: string; filename: string; row_count?: number; valid_count?: number };
  }> {
    // 1. Load or seed agent personas
    let agentRows = (
      await pool.query(
        `SELECT a.id as agent_id, a.name, a.description, v.id as version_id, v.instructions, v.questions, v.language
         FROM agents a
         JOIN agent_versions v ON v.agent_id = a.id AND v.version = a.current_version
         WHERE a.workspace_id = $1
         ORDER BY a.name ASC`,
        [workspaceId],
      )
    ).rows;

    if (!agentRows.length) {
      await transaction(async (client) => {
        await seedAgentPersonas(client, workspaceId);
      });
      agentRows = (
        await pool.query(
          `SELECT a.id as agent_id, a.name, a.description, v.id as version_id, v.instructions, v.questions, v.language
           FROM agents a
           JOIN agent_versions v ON v.agent_id = a.id AND v.version = a.current_version
           WHERE a.workspace_id = $1
           ORDER BY a.name ASC`,
          [workspaceId],
        )
      ).rows;
    }

    // 2. Load workspace metadata
    const workspace = (
      await pool.query(
        'SELECT name, timezone FROM workspaces WHERE id = $1',
        [workspaceId],
      )
    ).rows[0];

    // 3. Telephony kill-switch status
    const killSwitch = (
      await pool.query(
        "SELECT value FROM system_settings WHERE key = 'telephony_kill_switch'",
      )
    ).rows[0]?.value;

    // 4. Recent campaigns in workspace
    const campaignRows = (
      await pool.query(
        `SELECT c.id, c.name, c.status, c.mode, a.name as agent_name,
           (SELECT count(*)::int FROM campaign_contacts cc WHERE cc.campaign_id = c.id) as total_contacts,
           (SELECT count(*)::int FROM campaign_contacts cc WHERE cc.campaign_id = c.id AND cc.status = 'completed') as completed_contacts
         FROM campaigns c
         LEFT JOIN agent_versions av ON av.id = c.agent_version_id
         LEFT JOIN agents a ON a.id = av.agent_id
         WHERE c.workspace_id = $1
         ORDER BY c.updated_at DESC
         LIMIT 5`,
        [workspaceId],
      )
    ).rows;

    // 5. Contacts directory stats
    const contactStats = (
      await pool.query(
        `SELECT count(*)::int as total,
           count(*) FILTER(WHERE consent = true)::int as consented
         FROM contacts WHERE workspace_id = $1`,
        [workspaceId],
      )
    ).rows[0];

    // 6. Check for real existing import roster (do not seed fake data)
    const importRow = (
      await pool.query(
        'SELECT id, filename, row_count, valid_count FROM imports WHERE workspace_id = $1 ORDER BY created_at DESC LIMIT 1',
        [workspaceId],
      )
    ).rows[0] as
      | { id: string; filename: string; row_count: number; valid_count: number }
      | undefined;

    const agentsListStr = agentRows
      .map(
        (a) =>
          `- ${a.name} (${a.language || 'English'}): ${a.description}. Key questions: ${(a.questions || []).join(', ') || 'General inquiry'}`,
      )
      .join('\n');

    const campaignsListStr = campaignRows.length
      ? campaignRows
          .map(
            (c) =>
              `- "${c.name}": status=${c.status}, mode=${c.mode}, progress=${c.completed_contacts}/${c.total_contacts} calls, agent=${c.agent_name || 'Agent'}`,
          )
          .join('\n')
      : '- No past campaigns executed yet.';

    const killSwitchStr = killSwitch?.active
      ? 'ACTIVE (Emergency stop enabled - live dialing halted)'
      : 'INACTIVE (Telephony operating normally)';

    const systemPrompt = `You are Outreach Intern AI, a helpful, intelligent, and friendly conversational AI assistant—just like ChatGPT—integrated into the Outreach Intern voice telephony platform.

You can chat freely on ANY topic: greetings, general knowledge, explaining concepts, coding, brainstorming, writing, or conversing about the user's day.

Whenever relevant, you also possess real-time operational context about this Outreach Intern workspace:
- Current Workspace: ${workspace?.name || 'Primary Operations'} (Timezone: ${workspace?.timezone || 'Asia/Kolkata'})
- Telephony Kill Switch: ${killSwitchStr}
- Contact Directory: ${contactStats?.total ?? 0} real contacts (${contactStats?.consented ?? 0} consented for outreach)
- Active Contact Roster: ${importRow ? `${importRow.filename} (${importRow.valid_count ?? importRow.row_count ?? 0} verified contacts)` : 'No roster uploaded yet'}
- Available Voice Agents in Workspace:
${agentsListStr}
- Recent Campaigns in Workspace:
${campaignsListStr}

Interaction Guidelines:
1. Warm, Natural Conversation:
   - If the user says "hi", "hello", "hey", or chats casually, greet them naturally and warmly like ChatGPT, introduce yourself, and offer assistance.
   - For general questions (coding, explanations, advice), answer thoroughly with well-structured Markdown, code blocks, or bullet points.
   - DO NOT include a \`\`\`campaign-draft\`\`\` code block for casual chat, greetings, or questions. NEVER trigger a campaign draft card unless explicitly asked.
2. Voice & Campaign Operations:
   - If the operator asks about agents, campaigns, call history, or policies, provide accurate answers using the workspace context above.
   - ONLY if the operator asks to plan, draft, create, or launch an outreach campaign (e.g. "Draft an outreach campaign for...", "Call candidates for interview...", "Remind attendees..."):
     Explain the outreach strategy clearly, and include a structured draft block at the end:
     \`\`\`campaign-draft
     {
       "objective": "Clear summary of the outreach campaign",
       "agentName": "Name of best matching agent persona from available list",
       "agentLanguage": "Language for the voice agent",
       "steps": ["Step 1: ...", "Step 2: ...", "Step 3: ...", "Step 4: ..."],
       "questions": ["Question 1: ...", "Question 2: ..."]
     }
     \`\`\`
     The app will automatically parse this block into an interactive Confirmation Drawer for the user.`;

    return { systemPrompt, agentRows, importRow };
  }

  private async createCampaignFromDraft(
    workspaceId: string,
    threadId: string,
    draftData: {
      objective: string;
      agentName: string;
      agentLanguage?: string;
      steps: string[];
      questions: string[];
    },
    agentRows: Array<{
      agent_id: string;
      name: string;
      version_id: string;
      language: string;
    }>,
    importId: string,
  ): Promise<Record<string, unknown>> {
    const matchedAgent =
      agentRows.find((a) => a.name.toLowerCase() === draftData.agentName.toLowerCase()) ||
      agentRows[0]!;

    const defaultPolicy = {
      timezone: 'Asia/Kolkata',
      windowStart: '09:00',
      windowEnd: '20:00',
      concurrency: 2,
      budgetMinor: 10000,
      currency: 'INR',
      estimatedCostPerCallMinor: 500,
    };

    const planContent = {
      version: 1,
      planner: 'openai',
      model: 'gpt-6-luna',
      steps: draftData.steps.map((s, idx) => ({
        name: `Stage ${idx + 1}`,
        description: s,
      })),
      questions: draftData.questions,
    };

    const campaignRow = (
      await pool.query(
        `INSERT INTO campaigns(workspace_id, name, objective, mode, status, agent_version_id, import_id, policy, plan)
         VALUES($1, $2, $3, 'simulation', 'planned', $4, $5, $6, $7)
         RETURNING *`,
        [
          workspaceId,
          `Outreach: ${draftData.objective.slice(0, 40)}`,
          draftData.objective,
          matchedAgent.version_id,
          importId,
          JSON.stringify(defaultPolicy),
          JSON.stringify(planContent),
        ],
      )
    ).rows[0];

    // Queue real contacts from this specific import or workspace
    await pool.query(
      `INSERT INTO campaign_contacts(workspace_id, campaign_id, contact_id, status)
       SELECT $1, $2, ir.contact_id, 'queued'
       FROM import_rows ir
       WHERE ir.import_id = $3 AND ir.contact_id IS NOT NULL AND ir.status = 'valid'
       ON CONFLICT DO NOTHING`,
      [workspaceId, campaignRow.id, importId],
    );

    const contactStats = (
      await pool.query(
        `SELECT
           count(*)::int as total,
           count(*) FILTER(WHERE status != 'excluded')::int as eligible,
           count(*) FILTER(WHERE status = 'excluded')::int as excluded
         FROM campaign_contacts
         WHERE campaign_id = $1 AND workspace_id = $2`,
        [campaignRow.id, workspaceId],
      )
    ).rows[0];

    const eligibleCount = contactStats?.eligible ?? 0;
    const excludedCount = contactStats?.excluded ?? 0;

    const snap = planningSnapshot(campaignRow);
    const planSnapshotHash = createHash('sha256').update(snap).digest('hex');

    await pool.query(
      'UPDATE chat_threads SET campaign_id = $1 WHERE id = $2',
      [campaignRow.id, threadId],
    );

    return {
      campaignId: campaignRow.id,
      objective: draftData.objective,
      mode: campaignRow.mode,
      eligibleCount,
      excludedCount,
      planSnapshotHash,
      agentName: matchedAgent.name,
      agentLanguage: matchedAgent.language || 'English',
      steps: draftData.steps,
      questions: draftData.questions,
      estimatedCostMinor: 0,
    };
  }

  async streamMessage(
    identity: SessionIdentity,
    threadId: string,
    body: unknown,
    res: Response,
    streams?: StreamsService,
  ): Promise<void> {
    const input = parse(SendMessageRequestSchema, body);

    const thread = (
      await pool.query(
        'SELECT id FROM chat_threads WHERE id = $1 AND workspace_id = $2 AND user_id = $3',
        [threadId, identity.workspaceId, identity.userId],
      )
    ).rows[0];
    if (!thread)
      throw new DomainError('THREAD_NOT_FOUND', 'Thread not found', 404);

    // Save user message to database
    const userMsg = (
      await pool.query(
        `INSERT INTO chat_messages(thread_id, role, content, attachments)
         VALUES($1, 'user', $2, $3)
         RETURNING *`,
        [threadId, input.content, JSON.stringify(input.attachmentIds || [])],
      )
    ).rows[0];

    await pool.query(
      'UPDATE chat_threads SET updated_at = now() WHERE id = $1',
      [threadId],
    );

    // Establish SSE stream headers
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    // Broadcast user message event
    res.write(
      `event: user_message\ndata: ${JSON.stringify(clean(userMsg))}\n\n`,
    );

    const controller = new AbortController();
    let closed = false;
    let release: (() => void) | undefined;
    if (streams) {
      release = streams.register(res, () => {
        closed = true;
        controller.abort();
      });
    }

    res.on('close', () => {
      closed = true;
      controller.abort();
      release?.();
    });

    try {
      const { systemPrompt, agentRows, importRow } =
        await this.buildSystemPrompt(identity.workspaceId);

      const historyRows = (
        await pool.query(
          'SELECT role, content FROM chat_messages WHERE thread_id = $1 ORDER BY created_at ASC LIMIT 16',
          [threadId],
        )
      ).rows;

      const { apiKey, baseURL, model } = resolveModelCredentials();
      let accumulatedText = '';

      if (apiKey) {
        const messages = [
          { role: 'system', content: systemPrompt },
          ...historyRows.map((h) => ({ role: h.role, content: h.content })),
        ];

        const modelRes = await fetch(`${baseURL}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            messages,
            stream: true,
            temperature: 0.7,
          }),
          signal: controller.signal,
        });

        if (modelRes.ok && modelRes.body) {
          const reader = modelRes.body.getReader();
          const decoder = new TextDecoder('utf-8');
          let buffer = '';

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() ?? '';

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed || trimmed.startsWith(':')) continue;
              if (trimmed === 'data: [DONE]') break;
              if (trimmed.startsWith('data: ')) {
                try {
                  const json = JSON.parse(trimmed.slice(6));
                  const delta = json.choices?.[0]?.delta?.content;
                  if (delta) {
                    accumulatedText += delta;
                    if (!closed && !res.writableEnded) {
                      res.write(
                        `event: delta\ndata: ${JSON.stringify({ text: delta })}\n\n`,
                      );
                    }
                  }
                } catch {
                  // Partial JSON chunk
                }
              }
            }
          }
        }
      }

      // Fallback if model was unreachable or produced no content
      if (!accumulatedText.trim()) {
        const text = input.content.toLowerCase();
        if (/hi|hello|hey/i.test(text)) {
          accumulatedText =
            'Hi! I am Outreach Intern AI, your assistant for voice calling campaigns and operations. How can I help you today?';
        } else {
          accumulatedText =
            "I'm here to assist you with outreach planning, answering questions about your voice agents, and configuring campaigns. What would you like to work on?";
        }
        if (!closed && !res.writableEnded) {
          res.write(
            `event: delta\ndata: ${JSON.stringify({ text: accumulatedText })}\n\n`,
          );
        }
      }

      // Check if response contains a campaign-draft block
      let finalDraftObject: Record<string, unknown> | null = null;
      const isIntentionalDraft =
        /draft|campaign|outreach|call\s+candidates|call\s+leads|remind|schedule\s+calls|launch|plan\s+calls/i.test(
          input.content,
        );

      const draftMatch = isIntentionalDraft
        ? accumulatedText.match(/```campaign-draft\s*([\s\S]*?)\s*```/)
        : null;

      if (draftMatch && draftMatch[1]) {
        try {
          const draftData = JSON.parse(draftMatch[1]);

          let targetImportId: string | undefined;
          if (input.attachmentIds && input.attachmentIds.length > 0) {
            const matched = (
              await pool.query(
                'SELECT id FROM imports WHERE id = $1 AND workspace_id = $2',
                [input.attachmentIds[0], identity.workspaceId],
              )
            ).rows[0]?.id;
            if (matched) targetImportId = matched;
          }
          if (!targetImportId) {
            targetImportId = importRow?.id;
          }
          if (!targetImportId) {
            const emptyCsv = Buffer.from('name,phone\n');
            const pendingImport = (
              await pool.query(
                `INSERT INTO imports(workspace_id, filename, media_type, source_bytes, mapping, region, synthetic, status, row_count, valid_count, error_count)
                 VALUES($1, 'pending_roster.csv', 'text/csv', $2, '{"name":"name","phone":"phone"}', 'IN', false, 'ready', 0, 0, 0)
                 RETURNING id`,
                [identity.workspaceId, emptyCsv],
              )
            ).rows[0];
            targetImportId = pendingImport.id;
          }

          finalDraftObject = await this.createCampaignFromDraft(
            identity.workspaceId,
            threadId,
            draftData,
            agentRows,
            targetImportId!,
          );
          if (!closed && !res.writableEnded) {
            res.write(
              `event: draft\ndata: ${JSON.stringify(finalDraftObject)}\n\n`,
            );
          }
        } catch {
          // Non-JSON draft block
        }
      }

      // Save assistant message to database
      const assistantMsg = (
        await pool.query(
          `INSERT INTO chat_messages(thread_id, role, content, metadata)
           VALUES($1, 'assistant', $2, $3)
           RETURNING *`,
          [
            threadId,
            accumulatedText,
            JSON.stringify(finalDraftObject ? { draft: finalDraftObject } : {}),
          ],
        )
      ).rows[0];

      if (!closed && !res.writableEnded) {
        res.write(
          `event: done\ndata: ${JSON.stringify(clean(assistantMsg))}\n\n`,
        );
        res.end();
      }
    } catch (error) {
      if (!closed && !res.writableEnded) {
        res.write(
          `event: error\ndata: ${JSON.stringify({ message: String(error) })}\n\n`,
        );
        res.end();
      }
    }
  }

  async postMessage(
    identity: SessionIdentity,
    threadId: string,
    body: unknown,
  ): Promise<unknown> {
    const input = parse(SendMessageRequestSchema, body);

    const thread = (
      await pool.query(
        'SELECT id FROM chat_threads WHERE id = $1 AND workspace_id = $2 AND user_id = $3',
        [threadId, identity.workspaceId, identity.userId],
      )
    ).rows[0];
    if (!thread)
      throw new DomainError('THREAD_NOT_FOUND', 'Thread not found', 404);

    return transaction(async (client) => {
      // 1. Insert user message
      const userMsg = (
        await client.query(
          `INSERT INTO chat_messages(thread_id, role, content, attachments)
           VALUES($1, 'user', $2, $3)
           RETURNING *`,
          [threadId, input.content, JSON.stringify(input.attachmentIds || [])],
        )
      ).rows[0];

      await client.query(
        'UPDATE chat_threads SET updated_at = now() WHERE id = $1',
        [threadId],
      );

      const { systemPrompt, agentRows, importRow } =
        await this.buildSystemPrompt(identity.workspaceId);

      const historyRows = (
        await client.query(
          'SELECT role, content FROM chat_messages WHERE thread_id = $1 ORDER BY created_at ASC LIMIT 16',
          [threadId],
        )
      ).rows;

      const { apiKey, baseURL, model } = resolveModelCredentials();
      let assistantReply = '';

      if (apiKey) {
        try {
          const messages = [
            { role: 'system', content: systemPrompt },
            ...historyRows.map((h) => ({ role: h.role, content: h.content })),
          ];

          const response = await fetch(`${baseURL}/chat/completions`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
              model,
              messages,
              temperature: 0.7,
            }),
            signal: AbortSignal.timeout(20000),
          });

          if (response.ok) {
            const data = (await response.json()) as {
              choices: Array<{ message: { content: string } }>;
            };
            assistantReply = data.choices[0]?.message?.content || '';
          }
        } catch {
          // Fall back gracefully
        }
      }

      if (!assistantReply.trim()) {
        const text = input.content.toLowerCase();
        if (/hi|hello|hey/i.test(text)) {
          assistantReply =
            'Hi! I am Outreach Intern AI, your assistant for voice calling campaigns and operations. How can I help you today?';
        } else {
          assistantReply =
            "I'm here to assist you with outreach planning, answering questions about your voice agents, and configuring campaigns. What would you like to work on?";
        }
      }

      // Check if response contains a campaign-draft block
      let finalDraftObject: Record<string, unknown> | null = null;
      const isIntentionalDraft =
        /draft|campaign|outreach|call\s+candidates|call\s+leads|remind|schedule\s+calls|launch|plan\s+calls/i.test(
          input.content,
        );
      const draftMatch = isIntentionalDraft
        ? assistantReply.match(/```campaign-draft\s*([\s\S]*?)\s*```/)
        : null;

      if (draftMatch && draftMatch[1]) {
        try {
          const draftData = JSON.parse(draftMatch[1]);

          let targetImportId: string | undefined;
          if (input.attachmentIds && input.attachmentIds.length > 0) {
            const matched = (
              await client.query(
                'SELECT id FROM imports WHERE id = $1 AND workspace_id = $2',
                [input.attachmentIds[0], identity.workspaceId],
              )
            ).rows[0]?.id;
            if (matched) targetImportId = matched;
          }
          if (!targetImportId) {
            targetImportId = importRow?.id;
          }
          if (!targetImportId) {
            const emptyCsv = Buffer.from('name,phone\n');
            const pendingImport = (
              await client.query(
                `INSERT INTO imports(workspace_id, filename, media_type, source_bytes, mapping, region, synthetic, status, row_count, valid_count, error_count)
                 VALUES($1, 'pending_roster.csv', 'text/csv', $2, '{"name":"name","phone":"phone"}', 'IN', false, 'ready', 0, 0, 0)
                 RETURNING id`,
                [identity.workspaceId, emptyCsv],
              )
            ).rows[0];
            targetImportId = pendingImport.id;
          }

          finalDraftObject = await this.createCampaignFromDraft(
            identity.workspaceId,
            threadId,
            draftData,
            agentRows,
            targetImportId!,
          );
        } catch {
          // Non-JSON draft block
        }
      }

      // Insert Assistant Message
      const assistantMsg = (
        await client.query(
          `INSERT INTO chat_messages(thread_id, role, content, metadata)
           VALUES($1, 'assistant', $2, $3)
           RETURNING *`,
          [
            threadId,
            assistantReply,
            JSON.stringify(finalDraftObject ? { draft: finalDraftObject } : {}),
          ],
        )
      ).rows[0];

      return clean({
        userMessage: userMsg,
        assistantMessage: assistantMsg,
        draft: finalDraftObject,
      });
    });
  }
}
