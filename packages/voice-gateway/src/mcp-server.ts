import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { MIoT, MiNA } from '@mi-gpt/miot';
import { z } from 'zod';

/**
 * Start an embedded MCP server inside voice-gateway.
 *
 * Shares the same MIoT/MiNA session as the voice channel,
 * avoiding dual-login session conflicts.
 *
 * Transport: Streamable HTTP (not stdio), so OpenClaw connects
 * to this as a remote MCP server via HTTP.
 */
export async function startEmbeddedMcpServer(
    port: number,
    miot: MIoT,
    mina: MiNA,
): Promise<void> {
    const mcpServer = new McpServer({
        name: 'mihome-mcp',
        version: '0.1.0',
    });

    registerTools(mcpServer, miot, mina);

    const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined, // stateless
    });

    await mcpServer.connect(transport);

    const httpServer = createServer(async (req: IncomingMessage, res: ServerResponse) => {
        const url = new URL(req.url ?? '/', `http://${req.headers.host}`);

        if (url.pathname === '/mcp') {
            await transport.handleRequest(req, res);
        } else if (url.pathname === '/health') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ status: 'ok', service: 'mihome-mcp' }));
        } else {
            res.writeHead(404);
            res.end('Not Found');
        }
    });

    httpServer.listen(port, () => {
        console.log(`⚙️ MCP Server listening on http://0.0.0.0:${port}/mcp`);
    });
}

// ─── Tool Registration ──────────────────────────────────────

function registerTools(server: McpServer, miot: MIoT, mina: MiNA): void {
    // ── Device Tools ──

    server.tool(
        'list_devices',
        'List all MIoT devices under the current Xiaomi account, returning device names, DIDs, models, etc.',
        {},
        async () => {
            const devices = await miot.getDevices();
            return { content: [{ type: 'text' as const, text: JSON.stringify(devices ?? [], null, 2) }] };
        },
    );

    server.tool(
        'get_conversations',
        'Get recent conversation records from XiaoAI speaker.',
        { limit: z.number().min(1).max(50).default(10).describe('Number of records to fetch') },
        async (args) => {
            const conversations = await mina.getConversations({ limit: args.limit });
            return { content: [{ type: 'text' as const, text: JSON.stringify(conversations ?? {}, null, 2) }] };
        },
    );

    // ── Control Tools ──

    server.tool(
        'get_property',
        'Read MIoT device property value. Look up siid/piid at https://home.miot-spec.com/.',
        {
            did: z.string().describe('Device DID'),
            siid: z.number().describe('Service ID'),
            piid: z.number().describe('Property ID'),
        },
        async (args) => {
            const originalDid = miot.account.device.did;
            miot.account.device.did = args.did;
            try {
                const value = await miot.getProperty(args.siid, args.piid);
                return { content: [{ type: 'text' as const, text: JSON.stringify({ did: args.did, siid: args.siid, piid: args.piid, value }) }] };
            } finally {
                miot.account.device.did = originalDid;
            }
        },
    );

    server.tool(
        'set_property',
        'Set MIoT device property value. Look up siid/piid at https://home.miot-spec.com/.',
        {
            did: z.string().describe('Device DID'),
            siid: z.number().describe('Service ID'),
            piid: z.number().describe('Property ID'),
            value: z.any().describe('Value to set'),
        },
        async (args) => {
            const originalDid = miot.account.device.did;
            miot.account.device.did = args.did;
            try {
                const success = await miot.setProperty(args.siid, args.piid, args.value);
                return { content: [{ type: 'text' as const, text: JSON.stringify({ success, did: args.did, siid: args.siid, piid: args.piid, value: args.value }) }] };
            } finally {
                miot.account.device.did = originalDid;
            }
        },
    );

    server.tool(
        'do_action',
        'Execute MIoT device action. Look up siid/aiid at https://home.miot-spec.com/.',
        {
            did: z.string().describe('Device DID'),
            siid: z.number().describe('Service ID'),
            aiid: z.number().describe('Action ID'),
            args: z.array(z.any()).default([]).describe('Action arguments'),
        },
        async (args) => {
            const originalDid = miot.account.device.did;
            miot.account.device.did = args.did;
            try {
                const success = await miot.doAction(args.siid, args.aiid, args.args);
                return { content: [{ type: 'text' as const, text: JSON.stringify({ success, did: args.did, siid: args.siid, aiid: args.aiid }) }] };
            } finally {
                miot.account.device.did = originalDid;
            }
        },
    );

    // ── Speaker Tools ──

    server.tool(
        'speaker_tts',
        'Play TTS text through XiaoAi speaker immediately, interrupting any current playback.',
        { text: z.string().describe('Text content to speak') },
        async (args) => {
            const success = await mina.play({ text: args.text });
            return { content: [{ type: 'text' as const, text: JSON.stringify({ success, text: args.text }) }] };
        },
    );

    // ── Scene Tools ──

    const ActionStep = z.object({
        did: z.string().describe('Device DID'),
        type: z.enum(['set_property', 'do_action']).describe('Action type'),
        siid: z.number().describe('Service ID'),
        piid: z.number().optional().describe('Property ID (for set_property)'),
        aiid: z.number().optional().describe('Action ID (for do_action)'),
        value: z.any().optional().describe('Value or argument'),
        delay_ms: z.number().min(0).default(0).describe('Delay before execution (ms)'),
    });

    server.tool(
        'run_scene',
        'Execute a scene with multiple device operations in sequence.',
        {
            name: z.string().describe('Scene name'),
            steps: z.array(ActionStep).min(1).describe('Ordered action steps'),
        },
        async (args) => {
            const results: Array<{ step: number; success: boolean; error?: string }> = [];

            for (let i = 0; i < args.steps.length; i++) {
                const step = args.steps[i];
                if (step.delay_ms > 0) {
                    await new Promise((resolve) => setTimeout(resolve, step.delay_ms));
                }

                const originalDid = miot.account.device.did;
                miot.account.device.did = step.did;

                try {
                    let success = false;
                    if (step.type === 'set_property' && step.piid != null) {
                        success = await miot.setProperty(step.siid, step.piid, step.value);
                    } else if (step.type === 'do_action' && step.aiid != null) {
                        success = await miot.doAction(step.siid, step.aiid, step.value ?? []);
                    }
                    results.push({ step: i + 1, success });
                } catch (err: any) {
                    results.push({ step: i + 1, success: false, error: err.message });
                } finally {
                    miot.account.device.did = originalDid;
                }
            }

            return { content: [{ type: 'text' as const, text: JSON.stringify({ scene: args.name, results }, null, 2) }] };
        },
    );
}
