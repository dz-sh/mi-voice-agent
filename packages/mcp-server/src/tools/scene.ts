import { z } from 'zod';
import { bridge } from '../miot-bridge.js';
import { withDidLock } from '../did-lock.js';

const ActionStep = z.object({
  did: z.string().describe('Device DID'),
  type: z.enum(['set_property', 'do_action']).describe('Action type'),
  siid: z.number().describe('Service ID (siid)'),
  piid: z.number().optional().describe('Property ID (piid, required for set_property)'),
  aiid: z.number().optional().describe('Action ID (aiid, required for do_action)'),
  value: z.any().optional().describe('Property value or action argument'),
  delay_ms: z
    .number()
    .min(0)
    .default(0)
    .describe('Milliseconds to wait before execution, default 0'),
});

export const sceneTools = {
  run_scene: {
    description:
      'Execute a scene combining multiple device operations. Sequentially execute multiple set_property or do_action commands, ' +
      'with configurable delays between steps. Suitable for multi-device scenes like "Home mode" or "Sleep mode".',
    inputSchema: z.object({
      name: z.string().describe('Scene name (for log identification only)'),
      steps: z.array(ActionStep).min(1).describe('Ordered list of action steps'),
    }),
    handler: async (args: {
      name: string;
      steps: Array<{
        did: string;
        type: 'set_property' | 'do_action';
        siid: number;
        piid?: number;
        aiid?: number;
        value?: any;
        delay_ms: number;
      }>;
    }) => {
      await bridge.init();

      return withDidLock(async () => {
        const results: Array<{ step: number; success: boolean; error?: string }> = [];

        for (let i = 0; i < args.steps.length; i++) {
          const step = args.steps[i];

          if (step.delay_ms > 0) {
            await new Promise((resolve) => setTimeout(resolve, step.delay_ms));
          }

          const originalDid = bridge.miot.account.device.did;
          bridge.miot.account.device.did = step.did;

          try {
            let success = false;
            if (step.type === 'set_property' && step.piid != null) {
              success = await bridge.miot.setProperty(step.siid, step.piid, step.value);
            } else if (step.type === 'do_action' && step.aiid != null) {
              success = await bridge.miot.doAction(
                step.siid,
                step.aiid,
                step.value ?? [],
              );
            }
            results.push({ step: i + 1, success });
          } catch (err: any) {
            results.push({ step: i + 1, success: false, error: err.message });
          } finally {
            bridge.miot.account.device.did = originalDid;
          }
        }

        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ scene: args.name, results }, null, 2),
            },
          ],
        };
      });
    },
  },
};
