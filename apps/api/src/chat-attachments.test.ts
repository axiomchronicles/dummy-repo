import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import ExcelJS from 'exceljs';
import { pool } from '@outreach/database';
import { ChatService, isAnalysisOnlyIntent } from './chat';
import { config } from './auth';

const WS = '11111111-1111-4111-8111-111111111111';
const USER = '22222222-2222-4222-8222-222222222222';
const THREAD = '33333333-3333-4333-8333-333333333333';
const IMPORT_ID = '44444444-4444-4444-8444-444444444444';
const CORRUPTED_ID = '55555555-5555-4555-8555-555555555555';
const CSV_ID = '66666666-6666-4666-8666-666666666666';
const PDF_ID = '77777777-7777-4777-8777-777777777777';
const TXT_ID = '88888888-8888-4888-8888-888888888888';

const identity = {
  workspaceId: WS,
  userId: USER,
  role: 'owner' as const,
  name: 'Operator',
  email: 'operator@example.com',
};

async function createTestXlsx(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const sheet = wb.addWorksheet('Sheet1');
  sheet.addRow(['User ID', 'Fake Name', 'Indian Mobile Number (Fake Placeholder)']);
  sheet.addRow(['U001', 'Aarav Sharma', '00000 00001']);
  sheet.addRow(['U002', 'Meera Verma', '00000 00002']);
  sheet.addRow(['U003', 'Kabir Singh', '00000 00003']);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

describe('Attachment-aware intent detection', () => {
  it('identifies requests for read-only analysis without execution', () => {
    expect(isAnalysisOnlyIntent('Tell me the list do not execute anything just tell me')).toBe(true);
    expect(isAnalysisOnlyIntent("I mean what's inside the excel sheet i've shared")).toBe(true);
    expect(isAnalysisOnlyIntent("tell me what's inside this Excel sheet; do not execute anything")).toBe(true);
    expect(isAnalysisOnlyIntent('summarize this spreadsheet')).toBe(true);
    expect(isAnalysisOnlyIntent('what is inside the attached file?')).toBe(true);
    expect(isAnalysisOnlyIntent('explain the document contents, read-only')).toBe(true);
  });

  it('identifies execution requests that require call tools', () => {
    expect(isAnalysisOnlyIntent('Call Aarav Sharma on 00000 00001')).toBe(false);
    expect(isAnalysisOnlyIntent('Simulate a call to Meera Verma')).toBe(false);
    expect(isAnalysisOnlyIntent('Dial +919876543210')).toBe(false);
  });
});

describe('End-to-end chat attachment processing', () => {
  let xlsxBytes: Buffer;
  let originalModelProvider: typeof config.MODEL_PROVIDER;
  let mockMessages: Array<{
    id: string;
    thread_id: string;
    role: string;
    content: string;
    attachments: unknown;
    created_at: Date;
  }>;

  beforeEach(async () => {
    originalModelProvider = config.MODEL_PROVIDER;
    config.MODEL_PROVIDER = 'local';
    xlsxBytes = await createTestXlsx();
    mockMessages = [];

    vi.spyOn(pool, 'query').mockImplementation(async (queryOrText: unknown, values?: unknown[]) => {
      const text = typeof queryOrText === 'string' ? queryOrText : (queryOrText as { text: string }).text;
      const vals = values ?? [];

      if (text.includes('SELECT id FROM chat_threads')) {
        return { rows: [{ id: THREAD }], rowCount: 1 } as any;
      }
      if (text.includes('INSERT INTO chat_messages')) {
        const isUser = text.includes("'user'");
        const msg = {
          id: `msg-${mockMessages.length + 1}`,
          thread_id: String(vals[0]),
          role: isUser ? 'user' : 'assistant',
          content: String(vals[1]),
          attachments: isUser ? JSON.parse(String(vals[2] || '[]')) : [],
          metadata: isUser ? {} : JSON.parse(String(vals[2] || '{}')),
          created_at: new Date(),
        };
        mockMessages.push(msg);
        return { rows: [msg], rowCount: 1 } as any;
      }
      if (text.includes('UPDATE chat_threads')) {
        return { rows: [], rowCount: 1 } as any;
      }
      if (text.includes('SELECT attachments FROM chat_messages')) {
        const userMsgs = mockMessages.filter((m) => m.role === 'user' && m.thread_id === THREAD);
        return { rows: userMsgs.map((m) => ({ attachments: m.attachments })), rowCount: userMsgs.length } as any;
      }
      if (text.includes('FROM imports WHERE id=$1')) {
        const id = vals[0];
        if (id === IMPORT_ID) {
          return {
            rows: [
              {
                id: IMPORT_ID,
                filename: 'fake_indian_users.xlsx',
                media_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                source_bytes: xlsxBytes,
                status: 'ready',
                row_count: 3,
                valid_count: 3,
                error_count: 0,
              },
            ],
            rowCount: 1,
          } as any;
        }
        if (id === CORRUPTED_ID) {
          return {
            rows: [
              {
                id: CORRUPTED_ID,
                filename: 'corrupted.xlsx',
                media_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                source_bytes: Buffer.from('not valid zip or xlsx data'),
                status: 'uploaded',
                row_count: 0,
                valid_count: 0,
                error_count: 0,
              },
            ],
            rowCount: 1,
          } as any;
        }
        if (id === CSV_ID) {
          return {
            rows: [
              {
                id: CSV_ID,
                filename: 'contacts.csv',
                media_type: 'text/csv',
                source_bytes: Buffer.from('Name,Mobile,Role\nPriya Sharma,9876543210,Developer'),
                status: 'ready',
                row_count: 1,
                valid_count: 1,
                error_count: 0,
              },
            ],
            rowCount: 1,
          } as any;
        }
        if (id === PDF_ID) {
          const samplePdfPath = path.resolve(__dirname, '../../../node_modules/pdf-parse/test/data/01-valid.pdf');
          const pdfBytes = fs.readFileSync(samplePdfPath);
          return {
            rows: [
              {
                id: PDF_ID,
                filename: 'paper.pdf',
                media_type: 'application/pdf',
                source_bytes: pdfBytes,
                status: 'ready',
                row_count: 1,
                valid_count: 1,
                error_count: 0,
              },
            ],
            rowCount: 1,
          } as any;
        }
        if (id === TXT_ID) {
          return {
            rows: [
              {
                id: TXT_ID,
                filename: 'instructions.txt',
                media_type: 'text/plain',
                source_bytes: Buffer.from('Call instructions: Only contact customers during business hours.'),
                status: 'ready',
                row_count: 1,
                valid_count: 1,
                error_count: 0,
              },
            ],
            rowCount: 1,
          } as any;
        }
        return { rows: [], rowCount: 0 } as any;
      }
      if (text.includes('FROM workspaces')) {
        return { rows: [{ name: 'Test WS', timezone: 'UTC', settings: {} }], rowCount: 1 } as any;
      }
      if (text.includes('SELECT role,content,attachments FROM') || text.includes('SELECT role,content FROM')) {
        return { rows: mockMessages.map((m) => ({ role: m.role, content: m.content, attachments: m.attachments })), rowCount: mockMessages.length } as any;
      }
      if (text.includes('FROM contacts c LEFT JOIN LATERAL')) {
        return { rows: [], rowCount: 0 } as any;
      }
      if (text.includes('SELECT settings FROM workspaces')) {
        return { rows: [{ settings: {} }], rowCount: 1 } as any;
      }

      return { rows: [], rowCount: 0 } as any;
    });
  });

  afterEach(() => {
    config.MODEL_PROVIDER = originalModelProvider;
    vi.restoreAllMocks();
  });

  it('triggers read-only analysis without executing tools on user request with XLSX attachment', async () => {
    const service = new ChatService({} as any);

    const emitted: Array<{ event: string; data: unknown }> = [];
    const emit = async (event: string, data: unknown) => {
      emitted.push({ event, data });
    };

    const res = await (service as any).run(
      identity,
      THREAD,
      {
        content: 'Tell me the list do not execute anything just tell me',
        attachmentIds: [IMPORT_ID],
      },
      emit,
      new AbortController().signal,
    );

    // Verify response content includes spreadsheet details and names
    expect(res.assistantMessage).toBeDefined();
    expect(res.assistantMessage.content).toContain('fake_indian_users.xlsx');
    expect(res.assistantMessage.content).toContain('Aarav Sharma');
    expect(res.assistantMessage.content).toContain('Meera Verma');
    expect(res.assistantMessage.content).toContain('Kabir Singh');
    expect(res.assistantMessage.content).toContain('No operational tools were executed');

    // Verify no draft was generated and no call was initiated
    expect(res.draft).toBeNull();
    const draftEvents = emitted.filter((e) => e.event === 'draft');
    expect(draftEvents).toHaveLength(0);

    // Verify user message stored enriched attachment metadata
    expect(res.userMessage.attachments).toEqual([
      expect.objectContaining({
        id: IMPORT_ID,
        filename: 'fake_indian_users.xlsx',
        sizeBytes: xlsxBytes.length,
      }),
    ]);
  });

  it('preserves conversation history and retains file context across multiple turns', async () => {
    const service = new ChatService({} as any);
    const emit = async () => {};

    // Turn 1: User uploads file
    await (service as any).run(
      identity,
      THREAD,
      {
        content: 'Tell me the list do not execute anything just tell me',
        attachmentIds: [IMPORT_ID],
      },
      emit,
      new AbortController().signal,
    );

    // Turn 2: User asks follow-up WITHOUT re-sending attachmentIds
    const resTurn2 = await (service as any).run(
      identity,
      THREAD,
      {
        content: "I mean what's inside the excel sheet i've shared",
        attachmentIds: [], // Empty!
      },
      emit,
      new AbortController().signal,
    );

    // Turn 2 MUST have access to the file and NOT claim it is unavailable
    expect(resTurn2.assistantMessage.content).not.toContain('not able to view any files');
    expect(resTurn2.assistantMessage.content).toContain('fake_indian_users.xlsx');
    expect(resTurn2.assistantMessage.content).toContain('Aarav Sharma');
    expect(resTurn2.assistantMessage.content).toContain('Meera Verma');
  });

  it('reports verified error reason when attachment cannot be parsed', async () => {
    const service = new ChatService({} as any);
    const emit = async () => {};

    const res = await (service as any).run(
      identity,
      THREAD,
      {
        content: 'tell me what is inside this file; do not execute anything',
        attachmentIds: [CORRUPTED_ID],
      },
      emit,
      new AbortController().signal,
    );

    expect(res.assistantMessage.content).toContain('could not be parsed');
    expect(res.assistantMessage.content).not.toContain('I am not able to view any files');
  });

  it('correctly parses and presents CSV, PDF, and TXT attachments', async () => {
    const service = new ChatService({} as any);
    const emit = async () => {};

    // CSV
    const csvRes = await (service as any).run(
      identity,
      THREAD,
      {
        content: 'summarize the attached csv, do not execute anything',
        attachmentIds: [CSV_ID],
      },
      emit,
      new AbortController().signal,
    );
    expect(csvRes.assistantMessage.content).toContain('contacts.csv');
    expect(csvRes.assistantMessage.content).toContain('Priya Sharma');
    expect(csvRes.assistantMessage.content).toContain('9876543210');

    // PDF
    const pdfRes = await (service as any).run(
      identity,
      THREAD,
      {
        content: 'what is in this pdf document? do not execute anything',
        attachmentIds: [PDF_ID],
      },
      emit,
      new AbortController().signal,
    );
    expect(pdfRes.assistantMessage.content).toContain('paper.pdf');
    expect(pdfRes.assistantMessage.content).toContain('Trace-based Just-in-Time');

    // TXT
    const txtRes = await (service as any).run(
      identity,
      THREAD,
      {
        content: 'read this text file, no calls',
        attachmentIds: [TXT_ID],
      },
      emit,
      new AbortController().signal,
    );
    expect(txtRes.assistantMessage.content).toContain('instructions.txt');
    expect(txtRes.assistantMessage.content).toContain('Call instructions: Only contact customers during business hours.');
  });
});
