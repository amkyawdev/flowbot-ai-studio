import { describe, expect, it, vi } from 'vitest';
import { chatCompletion, resolveProvider } from '../src/integrations/providers';

describe('provider resolution', () => {
  it('maps groq and openrouter to OpenAI-compatible defaults', () => {
    expect(resolveProvider('groq').baseUrl).toContain('groq.com');
    expect(resolveProvider('openrouter').baseUrl).toContain('openrouter.ai');
    expect(resolveProvider('groq').kind).toBe('openai');
  });

  it('supports gemini, anthropic and cloudflare', () => {
    expect(resolveProvider('gemini').kind).toBe('gemini');
    expect(resolveProvider('anthropic').kind).toBe('anthropic');
    expect(resolveProvider('cloudflare').kind).toBe('cloudflare');
    expect(resolveProvider('cloudflare').defaultModel).toContain('@cf/');
  });

  it('throws for unknown providers', () => {
    expect(() => resolveProvider('nope')).toThrow(/Unsupported provider/);
  });
});

describe('cloudflare workers ai', () => {
  it('requires the env.AI binding', async () => {
    await expect(chatCompletion({
      provider: 'cloudflare',
      model: '@cf/meta/llama-3.1-8b-instruct',
      messages: [{ role: 'user', content: 'hi' }],
    })).rejects.toThrow(/binding is not configured/);
  });

  it('calls ai.run and returns the response text', async () => {
    const run = vi.fn(async () => ({ response: 'pong' }));
    const result = await chatCompletion({
      provider: 'cloudflare',
      model: '@cf/meta/llama-3.1-8b-instruct',
      messages: [{ role: 'user', content: 'ping' }],
      ai: { run },
    });
    expect(run).toHaveBeenCalledTimes(1);
    expect(result.text).toBe('pong');
  });
});

describe('openai-compatible base url', () => {
  it('requires a base URL for the custom provider', async () => {
    await expect(chatCompletion({
      provider: 'openai-compatible',
      model: 'x',
      apiKey: 'k',
      messages: [{ role: 'user', content: 'hi' }],
    })).rejects.toThrow(/Base URL is required/);
  });
});
