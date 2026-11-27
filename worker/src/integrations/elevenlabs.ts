/** ElevenLabs voice API (server-side only). */

export async function listVoices(
  apiKey: string,
  baseUrl = 'https://api.elevenlabs.io/v1',
): Promise<{ ok: boolean; count: number }> {
  const base = baseUrl.replace(/\/+$/, '');
  const res = await fetch(`${base}/voices`, {
    headers: { 'xi-api-key': apiKey },
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null) as { detail?: unknown } | null;
    const detail = typeof data?.detail === 'string' ? data.detail : res.statusText;
    throw new Error(`ElevenLabs API error (${res.status}): ${detail}`);
  }
  const data = await res.json().catch(() => null) as { voices?: unknown[] } | null;
  return { ok: true, count: data?.voices?.length ?? 0 };
}
