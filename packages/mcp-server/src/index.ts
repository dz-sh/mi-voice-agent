import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { controlTools } from './tools/control.js';
import { deviceTools } from './tools/device.js';
import { sceneTools } from './tools/scene.js';
import { speakerTools } from './tools/speaker.js';

const server = new McpServer({
  name: 'mihome-mcp',
  version: '0.1.0',
});

// ─── Device Tools ─────────────────────────────────────────
server.tool(
  'list_devices',
  deviceTools.list_devices.description,
  deviceTools.list_devices.inputSchema.shape,
  deviceTools.list_devices.handler,
);

server.tool(
  'get_conversations',
  deviceTools.get_conversations.description,
  deviceTools.get_conversations.inputSchema.shape,
  deviceTools.get_conversations.handler,
);

// ─── Control Tools ────────────────────────────────────────
server.tool(
  'get_property',
  controlTools.get_property.description,
  controlTools.get_property.inputSchema.shape,
  controlTools.get_property.handler,
);

server.tool(
  'set_property',
  controlTools.set_property.description,
  controlTools.set_property.inputSchema.shape,
  controlTools.set_property.handler,
);

server.tool(
  'do_action',
  controlTools.do_action.description,
  controlTools.do_action.inputSchema.shape,
  controlTools.do_action.handler,
);

// ─── Speaker Tools ────────────────────────────────────────
server.tool(
  'speaker_tts',
  speakerTools.speaker_tts.description,
  speakerTools.speaker_tts.inputSchema.shape,
  speakerTools.speaker_tts.handler,
);

server.tool(
  'speaker_play_url',
  speakerTools.speaker_play_url.description,
  speakerTools.speaker_play_url.inputSchema.shape,
  speakerTools.speaker_play_url.handler,
);

server.tool(
  'speaker_volume',
  speakerTools.speaker_volume.description,
  speakerTools.speaker_volume.inputSchema.shape,
  speakerTools.speaker_volume.handler,
);

server.tool(
  'speaker_get_status',
  speakerTools.speaker_get_status.description,
  speakerTools.speaker_get_status.inputSchema.shape,
  speakerTools.speaker_get_status.handler,
);

server.tool(
  'speaker_stop',
  speakerTools.speaker_stop.description,
  speakerTools.speaker_stop.inputSchema.shape,
  speakerTools.speaker_stop.handler,
);

// ─── Scene Tools ──────────────────────────────────────────
server.tool(
  'run_scene',
  sceneTools.run_scene.description,
  sceneTools.run_scene.inputSchema.shape,
  sceneTools.run_scene.handler,
);

// ─── Start Server ─────────────────────────────────────────
async function main() {
  console.error('🏠 MiHome-MCP MCP Server v0.1.0');
  console.error('   Based on MiGPT-Next (https://github.com/idootop/migpt-next)');
  console.error('');

  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error('✅ MCP Server started, waiting for client connections...');
}

main().catch((err) => {
  console.error('❌ Failed to start MCP Server:', err);
  process.exit(1);
});
