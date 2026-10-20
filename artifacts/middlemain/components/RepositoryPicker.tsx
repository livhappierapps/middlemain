import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Platform, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useTheme } from '@/context/ThemeContext';
import { beginGitHubSignIn, completeGitHubSignIn, DeviceCode, GITHUB_CLIENT_ID, GITHUB_INSTALL_URL, listRepo, loadRepoFile, loadRepoSnapshot, requestRepoPreflight, RepoFile, RepoListing, RepoPreflightReport } from '@/utils/github';

export function RepositoryPicker({ onSelect, onReset, onBusyChange }: { onSelect: (code: string, label: string) => void; onReset: () => void; onBusyChange?: (busy: boolean) => void }) {
  const { theme } = useTheme();
  const [url, setUrl] = useState('');
  const [branch, setBranch] = useState('');
  const [listing, setListing] = useState<RepoListing | null>(null);
  const [session, setSession] = useState<{ token: string; expiresAt: number } | null>(null);
  const [device, setDevice] = useState<DeviceCode | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [report, setReport] = useState<RepoPreflightReport | null>(null);
  const abort = useRef<AbortController | null>(null);
  const mounted = useRef(true);
  const token = session && session.expiresAt > Date.now() ? session.token : '';
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; abort.current?.abort(); }; }, []);
  useEffect(() => { onBusyChange?.(busy); }, [busy, onBusyChange]);
  useEffect(() => {
    if (!session) return;
    const timer = setTimeout(() => {
      if (session.expiresAt > Date.now()) return;
      abort.current?.abort();
      setSession(null);
      setListing(null);
      setReport(null);
      setError('GitHub authorization expired. Sign in again to access private repositories.');
    }, Math.max(session.expiresAt - Date.now(), 0));
    return () => clearTimeout(timer);
  }, [session, onReset]);
  const text = { color: theme.text, fontSize: 13, lineHeight: 20 };
  const button = { padding: 12, minHeight: 44, justifyContent: 'center' as const, borderRadius: theme.radius, backgroundColor: theme.primary + '22' };
  const input = { ...text, padding: 12, borderWidth: 1, borderColor: theme.border, borderRadius: theme.radius, backgroundColor: theme.surface };
  function reset() { setListing(null); setReport(null); setError(''); onReset(); }
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
        if (mounted.current) { setListing(result); setReport(null); onReset(); }
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
  async function preflight() {
    if (busy || !listing) return;
    setBusy(true); setError(''); setReport(null);
    const controller = new AbortController();
    abort.current = controller;
    const timer = setTimeout(() => controller.abort(), 60_000);
    try {
      const snapshot = await loadRepoSnapshot(listing, token, controller.signal);
      const result = await requestRepoPreflight(snapshot, controller.signal);
      if (mounted.current) setReport(result);
    } catch (error: any) {
      if (mounted.current) setError(controller.signal.aborted ? 'Repository check cancelled or timed out. No automatic retry or native build was started.' : error.message);
    } finally {
      clearTimeout(timer); abort.current = null;
      if (mounted.current) setBusy(false);
    }
  }
  return <View style={{ marginHorizontal: 16, marginBottom: 16, gap: 8, padding: 14, backgroundColor: theme.card, borderWidth: 1, borderColor: theme.border, borderRadius: theme.radius }}>
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
      <Text selectable style={text}>{listing.owner}/{listing.repo} · {listing.branch}{'\n'}Commit: {listing.commit}{'\n'}{listing.files.length} source/config files{listing.partial ? ' · partial list' : ''}</Text>
      <TouchableOpacity accessibilityRole="button" disabled={busy || !listing.files.length} onPress={preflight} style={button}><Text style={{ color: theme.primary }}>Repository preflight — no AI / EAS calls</Text></TouchableOpacity>
      <Text style={{ color: theme.textMuted, fontSize: 11, lineHeight: 18 }}>This sends a bounded source snapshot to Middlemain’s API. Review your code for secrets first. Your GitHub token is not sent to that API. Limits: 60 files, 220 KB of source, three GitHub downloads at once.</Text>
      <ScrollView style={{ maxHeight: 150 }} nestedScrollEnabled keyboardShouldPersistTaps="handled">
        {listing.files.map(file => <TouchableOpacity accessibilityRole="button" key={file.path} disabled={busy} onPress={() => load(file)} style={{ ...button, marginBottom: 6 }}><Text style={{ color: theme.primary }}>{file.path}</Text></TouchableOpacity>)}
      </ScrollView>
      {!listing.files.length && <Text style={{ color: theme.textMuted }}>No supported JS, TS, or JSON files under 150 KB were found.</Text>}
    </View>}
    {report && <View accessibilityLiveRegion="polite" style={{ gap: 8, padding: 12, borderWidth: 1, borderColor: theme.border, borderRadius: theme.radius }}>
      <Text style={{ ...text, fontWeight: '600' }}>Repository preflight: {report.status.replaceAll('_', ' ')}</Text>
      <Text selectable style={text}>{report.repository} · {report.branch}{'\n'}Commit: {report.commit}</Text>
      <Text style={text}>{report.summary}</Text>
      <Text style={{ color: theme.textMuted }}>{report.coverage.receivedFiles}/{report.coverage.totalFiles} supported files received · {report.coverage.checkedSourceFiles} JS/TS files checked · {report.durationMs} ms</Text>
      <ScrollView style={{ maxHeight: 320 }} nestedScrollEnabled>
        {([
          ['syntaxTypes', 'Syntax / types'], ['dependencies', 'Dependencies / imports'],
          ['configuration', 'Configuration concerns'], ['native', 'Not verified / native checks'],
        ] as const).map(([category, label]) => <View key={category} style={{ marginBottom: 12, gap: 5 }}>
          <Text style={{ ...text, fontWeight: '600' }}>{label}</Text>
          {!report.findings[category].length && <Text style={{ color: theme.textMuted }}>No findings in the supplied snapshot; not a build guarantee.</Text>}
          {report.findings[category].map((finding, i) => <Text selectable key={`${finding.code}-${i}`} style={{ color: finding.severity === 'error' ? theme.destructive : theme.text, lineHeight: 19 }}>
            {finding.severity.toUpperCase()} · {finding.code}{finding.path ? ` · ${finding.path}${finding.line ? `:${finding.line}` : ''}` : ''}{'\n'}{finding.message}
          </Text>)}
        </View>)}
      </ScrollView>
    </View>}
    <Text style={{ color: theme.textMuted, fontSize: 11, lineHeight: 18 }}>Selected-file checks and repository preflight use a pinned commit. At most 300 files are listed; files over 150 KB, symlinks, generated folders, and obvious credential files are skipped. No dependencies, scripts, compiler plugins, or EAS builds are executed. No check guarantees a native build will pass. Authorization stays in this session only.</Text>
  </View>;
}
