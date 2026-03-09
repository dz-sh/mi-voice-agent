import { z } from 'zod';
import { bridge } from '../miot-bridge.js';
import { withDidLock } from '../did-lock.js';

export const controlTools = {
  get_property: {
    description:
      'Read MIoT device property value. Requires device DID, service ID (siid), and property ID (piid).\n' +
      'You can look up specific device siid and piid at https://home.miot-spec.com/.',
    inputSchema: z.object({
      did: z.string().describe('Device DID (can be obtained via list_devices)'),
      siid: z.number().describe('Service ID (siid)'),
      piid: z.number().describe('Property ID (piid)'),
    }),
    handler: async (args: { did: string; siid: number; piid: number }) => {
      await bridge.init();
      return withDidLock(async () => {
        const originalDid = bridge.miot.account.device.did;
        bridge.miot.account.device.did = args.did;
        try {
          const value = await bridge.miot.getProperty(args.siid, args.piid);
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify({ did: args.did, siid: args.siid, piid: args.piid, value }),
              },
            ],
          };
        } finally {
          bridge.miot.account.device.did = originalDid;
        }
      });
    },
  },

  set_property: {
    description:
      'Set MIoT device property value. For example: set brightness, color temperature, on/off status, etc.\n' +
      'You can look up specific device siid and piid at https://home.miot-spec.com/.',
    inputSchema: z.object({
      did: z.string().describe('Device DID'),
      siid: z.number().describe('Service ID (siid)'),
      piid: z.number().describe('Property ID (piid)'),
      value: z.any().describe('Value to set (type depends on property definition)'),
    }),
    handler: async (args: { did: string; siid: number; piid: number; value: any }) => {
      await bridge.init();
      return withDidLock(async () => {
        const originalDid = bridge.miot.account.device.did;
        bridge.miot.account.device.did = args.did;
        try {
          const success = await bridge.miot.setProperty(args.siid, args.piid, args.value);
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify({ success, did: args.did, siid: args.siid, piid: args.piid, value: args.value }),
              },
            ],
          };
        } finally {
          bridge.miot.account.device.did = originalDid;
        }
      });
    },
  },

  do_action: {
    description:
      'Execute MIoT device capability. For example: turn on light, play music, switch mode, etc.\n' +
      'You can look up specific device siid and aiid at https://home.miot-spec.com/.',
    inputSchema: z.object({
      did: z.string().describe('Device DID'),
      siid: z.number().describe('Service ID (siid)'),
      aiid: z.number().describe('Action ID (aiid)'),
      args: z
        .array(z.any())
        .default([])
        .describe('List of action arguments, default is empty'),
    }),
    handler: async (args: { did: string; siid: number; aiid: number; args: any[] }) => {
      await bridge.init();
      return withDidLock(async () => {
        const originalDid = bridge.miot.account.device.did;
        bridge.miot.account.device.did = args.did;
        try {
          const success = await bridge.miot.doAction(args.siid, args.aiid, args.args);
          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify({ success, did: args.did, siid: args.siid, aiid: args.aiid }),
              },
            ],
          };
        } finally {
          bridge.miot.account.device.did = originalDid;
        }
      });
    },
  },
};
