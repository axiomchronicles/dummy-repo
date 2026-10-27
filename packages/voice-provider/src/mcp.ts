import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import Ajv from 'ajv/dist/2020.js';
const validator = new Ajv({ strict: false });
/** The official authoring surface is MCP+SSO, separate from the API-key PSTN API. */
export class SarvamMcp {
  constructor(private readonly token: string | undefined) {}
  async withClient<T>(run: (client: Client) => Promise<T>): Promise<T> {
    if (!this.token?.trim()) throw new Error('SARVAM_MCP_ACCESS_TOKEN');
    const client = new Client({ name: 'outreach-workspace', version: '1.0.0' });
    const transport = new StreamableHTTPClientTransport(
      new URL('https://mcp.sarvam.ai/voice-agents'),
      { requestInit: { headers: { Authorization: `Bearer ${this.token}` } } },
    );
    try {
      await client.connect(transport, { timeout: 15000 });
      return await run(client);
    } finally {
      await client.close();
    }
  }
  async capabilities() {
    return this.withClient(async (client) => {
      const tools = await client.listTools({}, { timeout: 15000 });
      return tools.tools
        .filter((tool) =>
          ['agents', 'configure_agent', 'configure_voicemail'].includes(
            tool.name,
          ),
        )
        .map((tool) => ({
          name: tool.name,
          description: tool.description ?? '',
          inputSchema: tool.inputSchema,
          outputSchema: tool.outputSchema ?? null,
        }));
    });
  }
  async execute(name: string, input: Record<string, unknown>) {
    if (!['agents', 'configure_agent', 'configure_voicemail'].includes(name))
      throw new Error('MCP_TOOL_UNAVAILABLE');
    return this.withClient(async (client) => {
      const tools = await client.listTools({}, { timeout: 15000 });
      const tool = tools.tools.find((t) => t.name === name);
      if (!tool) throw new Error('MCP_TOOL_UNAVAILABLE');
      // The account supplies its current operation enum and schema; never guess endpoints or fields.
      if (!validator.compile(tool.inputSchema)(input))
        throw new Error('MCP_INPUT_INVALID');
      const result = await client.callTool(
        { name, arguments: input },
        undefined,
        { timeout: 30000 },
      );
      if (result.isError) throw new Error('MCP_PROVIDER_REJECTED');
      if (
        tool.outputSchema &&
        result.structuredContent &&
        !validator.compile(tool.outputSchema)(result.structuredContent)
      )
        throw new Error('MCP_OUTPUT_INVALID');
      return result;
    });
  }
}
