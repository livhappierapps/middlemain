import AsyncStorage from '@react-native-async-storage/async-storage';

/** Use the owner's saved key only for the trusted API URL, never arbitrary hosts. */
export async function serverAuthHeaders(baseUrl: string, connectionKey = ''): Promise<Record<string, string>> {
  if (baseUrl.startsWith('//')) throw new Error('Protocol-relative API URLs are not allowed');
  const defaultBase = process.env.EXPO_PUBLIC_DOMAIN
    ? `https://${process.env.EXPO_PUBLIC_DOMAIN}/api` : '/api';
  const configuredBase = await AsyncStorage.getItem('@middlemain/apiUrl');
  const normalize = (value: string) => value.replace(/\/+$/, '');
  const trusted = normalize(baseUrl) === normalize(configuredBase || defaultBase);
  const key = connectionKey.trim() || (trusted ? await AsyncStorage.getItem('@middlemain_executive_key') : '');
  if (!key) {
    throw new Error('Owner Grok requires executive authorization in Settings. For public use, add your own AI provider key in Connect.');
  }
  if (!baseUrl.startsWith('/') && !baseUrl.startsWith('https://') &&
      !/^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?(?:\/|$)/.test(baseUrl)) {
    throw new Error('Owner authorization requires HTTPS (except local development).');
  }
  return { 'Content-Type': 'application/json', 'X-Executive-Key': key };
}
