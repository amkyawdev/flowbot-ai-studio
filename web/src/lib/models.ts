/** Model suggestions shared by every provider/model selector in the UI. */
export const MODEL_SUGGESTIONS: Record<string, string[]> = {
  openai: ['gpt-4o-mini', 'gpt-4o', 'gpt-4.1-mini'],
  groq: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant'],
  openrouter: [
    'deepseek/deepseek-r1:free',
    'deepseek/deepseek-chat-v3-0324:free',
    'meta-llama/llama-3.3-70b-instruct:free',
    'qwen/qwen-2.5-72b-instruct:free',
    'google/gemini-2.0-flash-exp:free',
    'openai/gpt-4o-mini',
  ],
  deepseek: ['deepseek-chat', 'deepseek-reasoner'],
  minimax: ['MiniMax-M2.1', 'MiniMax-Text-01', 'abab6.5s-chat'],
  gemini: ['gemini-2.0-flash', 'gemini-1.5-pro'],
  anthropic: ['claude-3-5-sonnet-latest', 'claude-3-5-haiku-latest'],
  cloudflare: [
    '@cf/meta/llama-3.3-70b-instruct-fp8-fast',
    '@cf/meta/llama-4-scout-17b-16e-instruct',
    '@cf/mistralai/mistral-small-3.1-24b-instruct',
  ],
  'openai-compatible': ['gpt-4o-mini', 'deepseek-chat', 'MiniMax-M2.1'],
  'experiential-labs': ['gpt-4o-mini', 'deepseek-chat', 'MiniMax-M2.1'],
  elevenlabs: ['eleven_multilingual_v2', 'eleven_turbo_v2_5', 'eleven_flash_v2_5'],
};

export function modelsFor(provider?: string): string[] {
  return MODEL_SUGGESTIONS[provider || ''] ?? [];
}
