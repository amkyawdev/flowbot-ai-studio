import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ChatMessage } from '@/api/client';

vi.mock('@/api/client', () => ({
  chatApi: {
    config: vi.fn(async () => ({
      configured: true,
      cloudflareAvailable: false,
      providers: [{ id: 'openai', label: 'OpenAI', defaultModel: 'gpt-4o-mini', requiresCredential: true }],
      credentials: [{ id: 'c1', name: 'key', provider: 'openai' }],
    })),
    listConversations: vi.fn(async () => ({ conversations: [] })),
    createConversation: vi.fn(async () => ({
      conversation: { id: 'cv1', title: 'New chat', archived: false, createdAt: '', updatedAt: '' },
    })),
    messages: vi.fn(async () => ({ messages: [] })),
    send: vi.fn(async () => ({
      userMessage: { id: 'u1', role: 'user', content: 'hi', createdAt: '' },
      assistantMessage: { id: 'a1', role: 'assistant', content: 'hello', createdAt: '' },
    })),
    regenerate: vi.fn(async () => ({ assistantMessage: { id: 'a2', role: 'assistant', content: 'again', createdAt: '' } })),
  },
  publicApi: {},
}));

import { chatApi } from '@/api/client';
import { appendChunk, chunkText, useChat } from './chat';

describe('chat reveal helpers', () => {
  it('splits text into chunks', () => {
    expect(chunkText('abcdef', 3)).toEqual(['abc', 'def']);
    expect(chunkText('', 3)).toEqual([]);
  });

  it('appends only to the matching message', () => {
    const messages: ChatMessage[] = [
      { id: 'a', role: 'assistant', content: 'x', createdAt: '' },
      { id: 'b', role: 'user', content: 'y', createdAt: '' },
    ];
    const next = appendChunk(messages, 'a', 'yz');
    expect(next[0].content).toBe('xyz');
    expect(next[1].content).toBe('y');
  });
});

describe('chat store', () => {
  beforeEach(() => {
    useChat.setState({
      conversations: [], activeId: null, messages: [], sending: false, streamingId: null, error: null,
      config: null, provider: 'openai', model: 'gpt-4o-mini', credentialId: '', systemPrompt: '',
    });
    vi.clearAllMocks();
  });

  it('loads config and creates a conversation', async () => {
    await useChat.getState().loadConfig();
    expect(useChat.getState().config?.configured).toBe(true);
    const id = await useChat.getState().newConversation();
    expect(id).toBe('cv1');
    expect(useChat.getState().activeId).toBe('cv1');
  });

  it('sends a message and reveals the assistant reply', async () => {
    await useChat.getState().newConversation();
    await useChat.getState().send('hi');
    const messages = useChat.getState().messages;
    expect(messages.some((m) => m.role === 'user' && m.content === 'hi')).toBe(true);
    expect(messages.find((m) => m.role === 'assistant')?.content).toBe('hello');
    expect(useChat.getState().sending).toBe(false);
  });

  it('captures request errors and clears the typing state', async () => {
    await useChat.getState().newConversation();
    vi.mocked(chatApi.send).mockRejectedValueOnce(new Error('boom'));
    await useChat.getState().send('hi');
    expect(useChat.getState().error).toBe('boom');
    expect(useChat.getState().sending).toBe(false);
    expect(useChat.getState().streamingId).toBeNull();
  });

  it('regenerates the last assistant reply', async () => {
    await useChat.getState().newConversation();
    await useChat.getState().send('hi');
    await useChat.getState().regenerate();
    const assistants = useChat.getState().messages.filter((m) => m.role === 'assistant');
    expect(assistants.at(-1)?.content).toBe('again');
  });
});
