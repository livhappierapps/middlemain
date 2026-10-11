/** Shared OpenAI/Anthropic SSE reader with bounded buffering and an idle timeout. */
export async function streamSSE(
  response: Response,
  onChunk: (content: string) => void,
  onDone: () => void,
  onError: (message: string) => void,
  idleTimeoutMs = 60_000,
): Promise<void> {
  const reader = response.body?.getReader();
  if (!reader) { onError('Streaming not supported'); return; }
  const decoder = new TextDecoder();
  let buffer = '';
  let outputLength = 0;
  const consume = (line: string): boolean => {
    const trimmed = line.trim();
    if (!trimmed.startsWith('data:')) return false;
    const raw = trimmed.slice(5).trim();
    if (raw === '[DONE]') return true;
    let json;
    try { json = JSON.parse(raw); } catch { return false; }
    if (json.error) throw new Error(json.error.message || 'Provider stream failed');
    const content = json.choices?.[0]?.delta?.content || json.delta?.text || '';
    if (typeof content === 'string' && content) {
      outputLength += content.length;
      if (outputLength > 250_000) throw new Error('AI response exceeded the safe display limit');
      onChunk(content);
    }
    return false;
  };
  try {
    while (true) {
      let timeout: ReturnType<typeof setTimeout> | undefined;
      const timedOut = new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error('AI stream timed out')), idleTimeoutMs);
      });
      let result;
      try { result = await Promise.race([reader.read(), timedOut]); }
      finally { clearTimeout(timeout); }
      if (result.done) {
        buffer += decoder.decode();
        if (buffer) consume(buffer);
        onDone();
        return;
      }
      buffer += decoder.decode(result.value, { stream: true });
      if (buffer.length > 1_000_000) throw new Error('AI stream event exceeded the safe size limit');
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (consume(line)) { onDone(); return; }
      }
    }
  } catch (error) {
    onError(error instanceof Error ? error.message : 'Stream error');
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
