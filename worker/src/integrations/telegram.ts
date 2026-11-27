const DEFAULT_API = 'https://api.telegram.org';

export interface TelegramClientOptions {
  token: string;
  apiUrl?: string;
}

export class TelegramClient {
  private base: string;
  private token: string;

  constructor(opts: TelegramClientOptions) {
    this.token = opts.token;
    this.base = (opts.apiUrl || DEFAULT_API).replace(/\/+$/, '');
  }

  private async call(method: string, body?: Record<string, unknown>): Promise<unknown> {
    const res = await fetch(`${this.base}/bot${this.token}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
    });
    const data = await res.json().catch(() => null) as { ok?: boolean; result?: unknown; description?: string } | null;
    if (!res.ok || data?.ok !== true) {
      throw new Error(`Telegram ${method} failed: ${data?.description || res.status}`);
    }
    return data?.result;
  }

  async getMe(): Promise<{ id: number; username: string; first_name: string }> {
    return (await this.call('getMe')) as { id: number; username: string; first_name: string };
  }

  async sendMessage(chatId: string | number, text: string, opts?: {
    parse_mode?: 'HTML' | 'Markdown';
    reply_markup?: unknown;
  }): Promise<unknown> {
    return this.call('sendMessage', {
      chat_id: chatId,
      text,
      parse_mode: opts?.parse_mode,
      reply_markup: opts?.reply_markup,
    });
  }

  async setWebhook(url: string, secretToken?: string): Promise<unknown> {
    return this.call('setWebhook', { url, secret_token: secretToken, allowed_updates: ['message', 'callback_query'] });
  }

  async deleteWebhook(): Promise<unknown> {
    return this.call('deleteWebhook');
  }

  async getWebhookInfo(): Promise<{ url: string; has_custom_certificate: boolean; pending_update_count: number; last_error_message?: string }> {
    return (await this.call('getWebhookInfo')) as {
      url: string;
      has_custom_certificate: boolean;
      pending_update_count: number;
      last_error_message?: string;
    };
  }

  async setMyCommands(commands: { command: string; description: string }[]): Promise<unknown> {
    return this.call('setMyCommands', { commands });
  }

  async answerCallbackQuery(callbackQueryId: string, text?: string): Promise<unknown> {
    return this.call('answerCallbackQuery', { callback_query_id: callbackQueryId, text });
  }
}