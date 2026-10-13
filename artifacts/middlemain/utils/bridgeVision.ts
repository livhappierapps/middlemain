export interface VisionSession {
  sessionId: string;
  visionUrl: string;
}

type VisionRequest = (url: string, init: {
  method: 'POST';
  headers: Record<string, string>;
  body: string;
  signal: AbortSignal;
}) => Promise<Pick<Response, 'ok' | 'status' | 'json'>>;

function statusHint(status: number): string {
  if (status === 401 || status === 403) return 'Bridge authorization rejected. Reconnect using your bridge key, not your xAI key.';
  if (status === 404) return 'Vision endpoint not found. Check the bridge service configuration.';
  if (status === 413) return 'The bridge rejected this image as too large.';
  if (status === 429) return 'Bridge rate or usage limit reached. Check its quota before sending again.';
  if (status >= 500) return 'The bridge service failed to process the image.';
  return 'The bridge rejected the image. Check its configuration.';
}

/** Exactly one request: an uncertain delivery must never silently retry paid inference. */
export async function deliverVisionFrame(
  session: VisionSession,
  imageData: string,
  source: 'camera' | 'screen',
  request: VisionRequest,
  signal?: AbortSignal,
  timeoutMs = 12_000,
): Promise<string | null> {
  const controller = new AbortController();
  const cancel = () => controller.abort();
  signal?.addEventListener('abort', cancel, { once: true });
  if (signal?.aborted) controller.abort();
  const timer = setTimeout(cancel, timeoutMs);
  try {
    if (controller.signal.aborted) throw new Error('Cancelled');
    const response = await request(session.visionUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        sessionId: session.sessionId,
        imageData,
        prompt: source === 'screen' ? 'Describe what you see on this screen.' : 'What do you observe?',
        isFirstFrame: false,
      }),
    });
    if (!response.ok) throw new VisionDeliveryError(`Image upload failed (HTTP ${response.status}). ${statusHint(response.status)}`);
    const data: unknown = await response.json().catch(() => {
      throw new VisionDeliveryError('Bridge accepted the request but returned an unreadable reply. It may already have processed the image; no automatic retry was made.');
    });
    if (controller.signal.aborted) throw new Error('Cancelled');
    const message = data && typeof data === 'object' && 'message' in data ? data.message : null;
    return typeof message === 'string' && message.trim() ? message : null;
  } catch (error) {
    if (signal?.aborted) {
      const cancelled = new Error('Image sharing stopped. An image already received by the bridge cannot be recalled.');
      cancelled.name = 'AbortError';
      throw cancelled;
    }
    if (error instanceof VisionDeliveryError) throw error;
    throw new VisionDeliveryError(controller.signal.aborted
      ? 'Bridge reply timed out. Delivery is unknown; the image may already have been received. No automatic retry was made.'
      : 'Could not confirm image delivery. Check your connection and bridge service. No automatic retry was made.');
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', cancel);
  }
}

class VisionDeliveryError extends Error {}

/** The tab bar overlays this non-scrollable composer; reserve space explicitly. */
export function bridgeBottomClearance(platform: string, nativeTabs: boolean, bottomInset: number): number {
  if (platform === 'web') return 84;
  if (nativeTabs) return Math.max(88, bottomInset + 64);
  return bottomInset + 49;
}
