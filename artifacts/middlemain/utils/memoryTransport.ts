/** A bounded Streamable HTTP client. Never automatically replay a memory write. */
export function createMemoryTransport(url: string, token: string, request: typeof fetch = fetch) {
  const endpoint = new URL(url);
  if (endpoint.protocol !== 'https:' || endpoint.username || endpoint.password || endpoint.hash) {
    throw new Error('Memory Machine needs an HTTPS endpoint without embedded credentials.');
  }
  let session = '';
  let protocol = '2025-06-18';
  let nextId = 0;
  let initialized: Promise<void> | undefined;
  async function rpc(method: string, params: unknown = {}, notification = false): Promise<any> {
    const id = ++nextId;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await request(endpoint.href, {
        method: 'POST', redirect: 'error', signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json, text/event-stream',
          Authorization: `Bearer ${token}`,
          ...(session ? { 'Mcp-Session-Id': session } : {}),
          ...(method !== 'initialize' ? { 'MCP-Protocol-Version': protocol } : {}),
        },
        body: JSON.stringify({ jsonrpc: '2.0', method, params, ...(notification ? {} : { id }) }),
      });
      if (!response.ok) {
        if (response.status === 404 && session) { session = ''; initialized = undefined; }
        throw new Error(`Memory Machine HTTP ${response.status}. ${
          response.status === 401 || response.status === 403 ? 'Reconnect with a valid Memory Machine token.'
          : response.status === 404 ? 'Check the MCP endpoint or reconnect the expired session.'
          : 'Check that the memory service is available.'}`);
      }
      if (notification) return;
      const sessionHeader = response.headers.get('mcp-session-id');
      if (sessionHeader) session = sessionHeader;
      const text = await response.text();
      let result: any;
      if (response.headers.get('content-type')?.includes('text/event-stream')) {
        for (const event of text.replace(/\r\n/g, '\n').split('\n\n')) {
          const data = event.split('\n').filter(line => line.startsWith('data:'))
            .map(line => line.slice(5).trimStart()).join('\n');
          if (!data) continue;
          const parsed = JSON.parse(data);
          if (parsed.id === id) result = parsed;
        }
      } else result = JSON.parse(text);
      if (!result || result.id !== id) throw new Error('Memory Machine returned an unmatched response.');
      if (result.error) {
        const error = new Error('Memory Machine rejected the request.') as Error & { code?: number };
        error.code = result.error.code;
        throw error;
      }
      if (result.result?.isError) throw new Error('The memory tool reported failure. No automatic retry was made.');
      return result.result;
    } catch (error) {
      if (controller.signal.aborted) throw new Error('Memory Machine timed out. Delivery is uncertain; no automatic retry was made.');
      // Never display service bodies, credentials, or network errors containing URLs.
      if (error instanceof Error && error.message.startsWith('Memory Machine')) throw error;
      if (error instanceof Error && error.message.startsWith('The memory tool')) throw error;
      throw new Error('Memory Machine could not be reached or returned an unreadable response.');
    } finally { clearTimeout(timer); }
  }
  async function initialize() {
    try {
      const result = await rpc('initialize', {
        protocolVersion: protocol, capabilities: {},
        clientInfo: { name: 'middlemain', version: '1.2.0' },
      });
      if (!result?.protocolVersion) throw new Error('Memory Machine returned an invalid initialization response.');
      if (!['2024-11-05', '2025-03-26', '2025-06-18', '2025-11-25', '2026-07-28'].includes(result.protocolVersion)) {
        throw new Error('Memory Machine uses an unsupported protocol version.');
      }
      protocol = result.protocolVersion;
      await rpc('notifications/initialized', {}, true);
    } catch (error) {
      // Older Memory Machine installations only implement tools/list and tools/call.
      // Fall back only for explicit Method Not Found, not for auth/network failures.
      if ((error as { code?: number }).code !== -32601) throw error;
    }
  }
  return {
    async call(method: string, params?: unknown) {
      initialized ??= initialize().catch(error => { initialized = undefined; throw error; });
      await initialized;
      return rpc(method, params);
    },
  };
}
