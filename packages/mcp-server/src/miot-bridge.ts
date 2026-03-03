import { getMIoT, getMiNA, type MIoT, type MiNA } from '@mi-gpt/miot';

export interface MiCredentials {
  userId: string;
  password?: string;
  passToken?: string;
  did: string;
  timeout?: number;
}

/**
 * Bridge to @mi-gpt/miot — lazily initializes MIoT and MiNA services
 * from environment variables or explicit config.
 */
class MIoTBridge {
  private _miot?: MIoT;
  private _mina?: MiNA;
  private _initialized = false;

  private _getCredentials(): MiCredentials {
    const userId = process.env.MI_USER ?? '';
    const password = process.env.MI_PASS;
    const passToken = process.env.MI_PASS_TOKEN;
    const did = process.env.MI_DID ?? '';
    const timeout = Number(process.env.MI_TIMEOUT) || 5000;

    if (!userId || !did) {
      throw new Error(
        '❌ Missing required environment variables. Please set MI_USER and MI_DID.\n' +
        '  MI_USER       — Xiaomi ID (Numeric)\n' +
        '  MI_DID        — Device name (as shown in MiHome)\n' +
        '  MI_PASS       — Password (choose between this or MI_PASS_TOKEN)\n' +
        '  MI_PASS_TOKEN — passToken (choose between this or MI_PASS)'
      );
    }

    if (!password && !passToken) {
      throw new Error('❌ Missing login credentials. Please set MI_PASS (password) or MI_PASS_TOKEN (passToken)');
    }

    return { userId, password, passToken, did, timeout };
  }

  async init(credentials?: MiCredentials): Promise<void> {
    if (this._initialized) return;

    const creds = credentials ?? this._getCredentials();
    const config = {
      userId: creds.userId,
      password: creds.password,
      passToken: creds.passToken,
      did: creds.did,
      timeout: creds.timeout ?? 5000,
      debug: process.env.MI_DEBUG === 'true',
    };

    console.error('🔄 Connecting to Xiaomi account...');

    this._miot = await getMIoT(config);
    this._mina = await getMiNA(config);

    if (!this._miot || !this._mina) {
      throw new Error('❌ Failed to initialize Mi Services. Please check account, password, and device name.');
    }

    this._initialized = true;
    console.error('✅ Successfully connected to Xiaomi services');
  }

  get miot(): MIoT {
    if (!this._miot) throw new Error('MIoT not initialized — call init() first');
    return this._miot;
  }

  get mina(): MiNA {
    if (!this._mina) throw new Error('MiNA not initialized — call init() first');
    return this._mina;
  }

  get initialized(): boolean {
    return this._initialized;
  }
}

export const bridge = new MIoTBridge();
