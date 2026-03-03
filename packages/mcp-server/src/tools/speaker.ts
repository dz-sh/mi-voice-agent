import { z } from 'zod';
import { bridge } from '../miot-bridge.js';

export const speakerTools = {
  speaker_tts: {
    description: 'Play TTS text through XiaoAI speaker. The speaker will read aloud the provided text content.',
    inputSchema: z.object({
      text: z.string().describe('Text content to speak'),
    }),
    handler: async (args: { text: string }) => {
      await bridge.init();
      const success = await bridge.mina.play({ text: args.text });
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ success, action: 'tts', text: args.text }),
          },
        ],
      };
    },
  },

  speaker_play_url: {
    description: 'Play the audio file from the specified URL through XiaoAI speaker.',
    inputSchema: z.object({
      url: z.string().url().describe('URL address of the audio file'),
    }),
    handler: async (args: { url: string }) => {
      await bridge.init();
      const success = await bridge.mina.play({ url: args.url });
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ success, action: 'play_url', url: args.url }),
          },
        ],
      };
    },
  },

  speaker_volume: {
    description: 'Set volume of XiaoAI speaker. Range 6-100.',
    inputSchema: z.object({
      volume: z
        .number()
        .min(6)
        .max(100)
        .describe('Volume value (6-100)'),
    }),
    handler: async (args: { volume: number }) => {
      await bridge.init();
      const success = await bridge.mina.setVolume(args.volume);
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ success, action: 'set_volume', volume: args.volume }),
          },
        ],
      };
    },
  },

  speaker_get_status: {
    description: 'Get the current playback status and volume of the XiaoAI speaker.',
    inputSchema: z.object({}),
    handler: async () => {
      await bridge.init();
      const status = await bridge.mina.getStatus();
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(status ?? { error: 'Unable to get status' }),
          },
        ],
      };
    },
  },

  speaker_stop: {
    description: 'Stop the current playback of the XiaoAI speaker.',
    inputSchema: z.object({}),
    handler: async () => {
      await bridge.init();
      const success = await bridge.mina.stop();
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify({ success, action: 'stop' }),
          },
        ],
      };
    },
  },
};
