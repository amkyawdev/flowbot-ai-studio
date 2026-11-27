import type { Env } from '../types';
import { createVault } from '../crypto';

/**
 * Credential vault resolver. Decrypts stored credential data server-side;
 * never returns ciphertext or plaintext to the client.
 */
export function makeCredentialResolver(env: Env, workspaceId: string) {
  let vaultPromise: ReturnType<typeof createVault> | null = null;
  const vault = () => {
    if (!vaultPromise) {
      if (!env.CREDENTIAL_MASTER_KEY) throw new Error('CREDENTIAL_MASTER_KEY is not configured');
      vaultPromise = createVault(env.CREDENTIAL_MASTER_KEY);
    }
    return vaultPromise;
  };

  return {
    /** Fetch a credential by id (scoped to workspace) and return its decrypted data map. */
    async get(credentialId: string): Promise<Record<string, string>> {
      const row = await env.DB.prepare('SELECT id, data_enc FROM credentials WHERE id = ? AND workspace_id = ?')
        .bind(credentialId, workspaceId).first<{ id: string; data_enc: string }>();
      if (!row) throw new Error(`Credential not found: ${credentialId}`);
      const v = await vault();
      const data = await v.decrypt(row.data_enc);
      return JSON.parse(data) as Record<string, string>;
    },

    async encrypt(data: Record<string, string>): Promise<string> {
      const v = await vault();
      return v.encrypt(JSON.stringify(data));
    },

    async decrypt(payload: string): Promise<string> {
      const v = await vault();
      return v.decrypt(payload);
    },

    /** Resolve a bot's telegram token (stored separately from credentials). */
    async botToken(botId: string): Promise<string> {
      const row = await env.DB.prepare('SELECT token_enc FROM bots WHERE id = ? AND workspace_id = ?')
        .bind(botId, workspaceId).first<{ token_enc: string }>();
      if (!row) throw new Error(`Bot not found: ${botId}`);
      const v = await vault();
      return v.decrypt(row.token_enc);
    },
  };
}

export type CredentialResolver = ReturnType<typeof makeCredentialResolver>;