import { z } from 'zod';
import { bridge } from '../miot-bridge.js';

export const deviceTools = {
  list_devices: {
    description: 'List all MIoT devices under the current Xiaomi account, returning device names, DIDs, models, etc.',
    inputSchema: z.object({}),
    handler: async () => {
      await bridge.init();
      const devices = await bridge.miot.getDevices();
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(devices ?? [], null, 2),
          },
        ],
      };
    },
  },

  get_conversations: {
    description:
      'Get recent conversation records from XiaoAI speaker. Can be used to understand voice commands given by the user.',
    inputSchema: z.object({
      limit: z
        .number()
        .min(1)
        .max(50)
        .default(10)
        .describe('Number of recent conversation records to fetch, default 10'),
    }),
    handler: async (args: { limit: number }) => {
      await bridge.init();
      const conversations = await bridge.mina.getConversations({
        limit: args.limit,
      });
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(conversations ?? {}, null, 2),
          },
        ],
      };
    },
  },
};
