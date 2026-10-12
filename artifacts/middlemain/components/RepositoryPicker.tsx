import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Platform, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useTheme } from '@/context/ThemeContext';
import { beginGitHubSignIn, completeGitHubSignIn, DeviceCode, GITHUB_CLIENT_ID, GITHUB_INSTALL_URL, listRepo, loadRepoFile, RepoFile, RepoListing } from '@/utils/github';

export function RepositoryPicker({ onSelect, onReset }: { onSelect: (code: string, label: string) => void; onReset: () => void }) {
  const { theme } = useTheme();
  const [url, setUrl] = useState('');
  const [branch, setBranch] = useState('');
  const [listing, setListing] = useState<RepoListing | null>(null);
  const [session, setSession] = useState<{ token: string; expiresAt: number } | null>(null);
  const [device, setDevice] = useState<DeviceCode | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const abort = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const token = session && session.expiresAt > Date.now() ? session.token : '';
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; abort.current?.abort(); }; }, []);
  useEffect(() => {
    if (!session) return;
    const timer = setTimeout(() => {
      if (session.expiresAt > Date.now()) return;
      setSession(null);
      setListing(null);
      setError('GitHub authorization expired. Sign in again to access private repositories.');
    }, Math.max(session.expiresAt - Date.now(), 0));
    return () => clearTimeout(timer);
  }, [session, onReset]);
  const text = { color: theme.text, fontSize: 13, lineHeight: 20 };
  const button = { padding: 12, minHeight: 44, justifyContent: 'center' as const, borderRadius: theme.radius, backgroundColor: theme.primary + '22' };
  const input = { ...text, padding: 12, borderWidth: 1, borderColor: theme.border, borderRadius: theme.radius, backgroundColor: theme.surface };
  function reset() { setListing(null); setError(''); onReset(); }
  async function load(file?: RepoFile) {
    if (busy) return;
    setBusy(true); setError('');
    const controller = new AbortController();
    abort.current = controller;
    const timer = setTimeout(() => controller.abort(), 30_000);
    try {
      if (file && listing) {
        const code = await loadRepoFile(listing, file, token, controller.signal);
        if (mounted.current) onSelect(code, `${listing.owner}/${listing.repo} · ${listing.branch} · ${file.path} · ${listing.commit.slice(0, 7)}`);
      } else {
        const result = await listRepo(url, branch, token, controller.signal);
        if (mounted.current) { setListing(result); onReset(); }
      }
    } catch (e: any) {
      if (mounted.current) { setError(controller.signal.aborted ? 'GitHub request stopped or timed out. No retry was sent.' : e.message); if (!file) setListing(null); }
    } finally { clearTimeout(timer); if (mounted.current) setBusy(false); abort.current = null; }
  }
  async function signIn() {
    if (busy) return;
    if (Platform.OS === 'web') { setError('Use GitHub sign-in in the installed iOS or Android app. The browser preview can load public repositories, but GitHub does not allow its device sign-in endpoint from a web page.'); return; }
    setBusy(true); setError('');
    const controller = new AbortController();
    abort.current = controller;
    try {
      const code = await beginGitHubSignIn(controller.signal);
      if (mounted.current) setDevice(code);
      const auth = await completeGitHubSignIn(code, controller.signal);
      if (mounted.current) { setSession(auth); setDevice(null); reset(); }
    } catch (e: any) { if (mounted.current) { setError(e.message); setDevice(null); } }
    finally { if (mounted.current) setBusy(false); abort.current = null; }
  }
  return <View style={{ paddingHorizontal: 16, marginBottom: 16, gap: 8 }}>
    <Text style={{ ...text, fontWeight: '600' }}>Load code from GitHub</Text>
    <TextInput accessibilityLabel="GitHub repository URL" editable={!busy} value={url} onChangeText={v => { setUrl(v); reset(); }} autoCapitalize="none" autoCorrect={false} keyboardType="url" placeholder="https://github.com/owner/repository" placeholderTextColor={theme.textMuted} style={input} />
    <TextInput accessibilityLabel="GitHub branch, optional" editable={!busy} value={branch} onChangeText={v => { setBranch(v); reset(); }} autoCapitalize="none" autoCorrect={false} placeholder="Branch (leave blank for default)" placeholderTextColor={theme.textMuted} style={input} />
    <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
      <TouchableOpacity accessibilityRole="button" disabled={busy || !url.trim()} onPress={() => load()} style={button}><Text style={{ color: theme.primary }}>Load repo files</Text></TouchableOpacity>
      <TouchableOpacity accessibilityRole="button" disabled={busy} onPress={() => token ? (setSession(null), reset()) : signIn()} style={button}>
        <Text style={{ color: theme.primary }}>{token ? 'Disconnect GitHub' : 'Sign in for private repos'}</Text>
      </TouchableOpacity>
      {busy && <TouchableOpacity accessibilityRole="button" onPress={() => abort.current?.abort()} style={button}><Text style={{ color: theme.primary }}>Cancel</Text></TouchableOpacity>}
    </View>
    {!GITHUB_CLIENT_ID && <Text style={{ color: theme.textMuted, lineHeight: 20 }}>Private-repo sign-in needs the app owner’s read-only GitHub App registration. It is not configured in this build. Public repositories and pasted code still work.</Text>}
    {!!GITHUB_CLIENT_ID && <TouchableOpacity accessibilityRole="link" onPress={() => Linking.openURL(GITHUB_INSTALL_URL)} style={button}><Text style={{ color: theme.primary }}>Grant access to selected repositories</Text></TouchableOpacity>}
    {!!token && <TouchableOpacity accessibilityRole="link" onPress={() => Linking.openURL('https://github.com/settings/apps/authorizations')} style={button}><Text style={{ color: theme.primary }}>Revoke GitHub access in GitHub settings</Text></TouchableOpacity>}
    {device && <View style={{ gap: 8 }}>
      <Text selectable style={text}>GitHub verification code: {device.user_code}</Text>
      <TouchableOpacity accessibilityRole="button" onPress={async () => { await Clipboard.setStringAsync(device.user_code); await Linking.openURL('https://github.com/login/device'); }} style={button}><Text style={{ color: theme.primary }}>Copy code and open GitHub</Text></TouchableOpacity>
      <Text style={{ color: theme.textMuted }}>Enter the code, review the app permissions, and authorize it. Return here when finished. Sign-in expires in 15 minutes.</Text>
    </View>}
    {busy && <ActivityIndicator accessibilityLabel="Loading from GitHub" color={theme.primary} />}
    {!!error && <Text accessibilityLiveRegion="polite" style={{ color: theme.destructive, lineHeight: 20 }}>{error}</Text>}
    {listing && <View style={{ gap: 8 }}>
      <Text style={text}>{listing.owner}/{listing.repo} · {listing.branch} · {listing.files.length} source/config files{listing.partial ? ' · partial list' : ''}</Text>
      <ScrollView style={{ maxHeight: 150 }} nestedScrollEnabled keyboardShouldPersistTaps="handled">
        {listing.files.map(file => <TouchableOpacity accessibilityRole="button" key={file.path} disabled={busy} onPress={() => load(file)} style={{ ...button, marginBottom: 6 }}><Text style={{ color: theme.primary }}>{file.path}</Text></TouchableOpacity>)}
      </ScrollView>
      {!listing.files.length && <Text style={{ color: theme.textMuted }}>No supported JS, TS, or JSON files under 150 KB were found.</Text>}
    </View>}
    <Text style={{ color: theme.textMuted, fontSize: 11, lineHeight: 18 }}>Only the chosen file is loaded, from a pinned commit. At most 300 files are listed; files over 150 KB, generated folders, and obvious credential files are skipped. Checks do not install dependencies, run repository scripts, or start EAS. Authorization stays in this session only.</Text>
  </View>;
}
