import { Feather } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { fetch } from 'expo/fetch';
import React, { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ThemedBackground } from '@/components/ThemedBackground';
import { useTheme } from '@/context/ThemeContext';

// ── Types ──────────────────────────────────────────────────────────────────────

type ContextMode = 'expo' | 'typescript' | 'javascript' | 'general';

const CONTEXT_OPTIONS: { key: ContextMode; label: string; icon: string }[] = [
  { key: 'expo',       label: 'Expo / RN',   icon: 'smartphone' },
  { key: 'typescript', label: 'TypeScript',  icon: 'code' },
  { key: 'javascript', label: 'JavaScript',  icon: 'file-text' },
  { key: 'general',   label: 'General',     icon: 'tool' },
];

function systemPromptFor(mode: ContextMode): string {
  const base = `You are an expert code debugger. Analyse the code below and list every problem you find.

Use EXACTLY this format for each issue — one per line:
🔴 ERROR: [what is wrong] — Line ~[N if you can tell] — Fix: [exact change needed]
🟡 WARNING: [potential problem] — Fix: [what to do]
🟢 TIP: [improvement or style note]

After listing all issues, add a blank line then write:

── VERDICT ──
[One of: ✅ Looks safe to build | ⚠️ Fix warnings before building | 🚫 DO NOT build — will fail]
[One sentence saying the single most important thing to fix first, or "Nothing blocking" if clean]

Rules:
- Be blunt and specific. No waffle.
- If you see a missing import, name the exact import.
- If a hook is used wrong, say exactly why and what the fix is.
- If something will cause an EAS build to fail, start that line with 🚫 EAS BLOCKER:`;

  const extras: Record<ContextMode, string> = {
    expo: '\n- Also check: missing Expo plugin in app.json, wrong permissions, native module used without proper config, bare workflow vs managed workflow mismatches, expo-modules-core version issues.',
    typescript: '\n- Also check: type errors, missing generics, incorrect interface implementations, strict mode violations.',
    javascript: '\n- Also check: undefined variables, async/await misuse, promise chains without catch.',
    general: '',
  };

  return base + extras[mode];
}

function getServerBase(): string {
  const domain = process.env.EXPO_PUBLIC_DOMAIN ?? '';
  if (!domain) return '';
  return `https://${domain}/api`;
}

// ── Result line parser ─────────────────────────────────────────────────────────

function lineColor(line: string, theme: any): string {
  if (line.startsWith('🔴') || line.startsWith('🚫')) return '#ff6b6b';
  if (line.startsWith('🟡')) return '#fbbf24';
  if (line.startsWith('🟢')) return '#34d399';
  if (line.startsWith('──') || line.startsWith('✅')) return '#a78bfa';
  if (line.startsWith('⚠️')) return '#fbbf24';
  return theme.text;
}

// ── Screen ─────────────────────────────────────────────────────────────────────

export default function DebugScreen() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();

  const [code, setCode] = useState('');
  const [mode, setMode] = useState<ContextMode>('expo');
  const [result, setResult] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const abortRef = useRef<boolean>(false);
  const resultScrollRef = useRef<ScrollView>(null);

  // Dry run state
  const [dryRunResult, setDryRunResult] = useState<{
    pass: boolean;
    verdict: 'CLEAN' | 'ERRORS' | 'WARNINGS_ONLY';
    errors: { line: number; col: number; code: string; message: string; severity: 'error' | 'warning' }[];
    summary: string;
    rawOutput: string;
    durationMs: number;
  } | null>(null);
  const [isDryRunning, setIsDryRunning] = useState(false);
  const dryRunScrollRef = useRef<ScrollView>(null);

  // ── Analyse ────────────────────────────────────────────────────────────────

  const handleAnalyze = useCallback(async () => {
    if (!code.trim()) {
      Alert.alert('Nothing to analyze', 'Paste some code first.');
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setIsAnalyzing(true);
    setResult('');
    abortRef.current = false;

    const base = getServerBase();
    if (!base) {
      setResult('⚠️ Cannot reach the server — make sure the API server is running.');
      setIsAnalyzing(false);
      return;
    }

    try {
      const resp = await fetch(`${base}/grok/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'grok-3',
          stream: true,
          systemPrompt: systemPromptFor(mode),
          messages: [
            {
              role: 'user',
              content: `Please debug this code:\n\n\`\`\`\n${code}\n\`\`\``,
            },
          ],
        }),
      });

      if (!resp.ok) {
        const txt = await resp.text().catch(() => '');
        setResult(`🚫 Server error ${resp.status}${txt ? ': ' + txt.slice(0, 200) : ''}`);
        setIsAnalyzing(false);
        return;
      }

      // Stream SSE
      const reader = (resp.body as any)?.getReader?.();
      if (!reader) {
        // Non-streaming fallback
        const json = await resp.json() as any;
        const text = json?.choices?.[0]?.message?.content ?? JSON.stringify(json);
        setResult(text);
        setIsAnalyzing(false);
        return;
      }

      const decoder = new TextDecoder();
      let buffer = '';
      let accumulated = '';

      while (!abortRef.current) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const raw of lines) {
          const line = raw.trim();
          if (!line || line === 'data: [DONE]') continue;
          if (!line.startsWith('data: ')) continue;
          try {
            const json = JSON.parse(line.slice(6)) as any;
            const delta = json?.choices?.[0]?.delta?.content ?? '';
            if (delta) {
              accumulated += delta;
              setResult(accumulated);
              // Auto-scroll
              setTimeout(() => resultScrollRef.current?.scrollToEnd({ animated: false }), 30);
            }
          } catch {}
        }
      }

      if (abortRef.current) {
        setResult((r) => r + '\n\n[Analysis stopped]');
      }
    } catch (err: any) {
      setResult(`🚫 Error: ${err?.message ?? 'Unknown error'}`);
    } finally {
      setIsAnalyzing(false);
    }
  }, [code, mode]);

  const handleStop = useCallback(() => {
    abortRef.current = true;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  const handleCopyResult = useCallback(async () => {
    if (!result) return;
    await Clipboard.setStringAsync(result);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert('Copied', 'Analysis copied to clipboard.');
  }, [result]);

  const handleClear = useCallback(() => {
    setCode('');
    setResult('');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  const handlePasteCode = useCallback(async () => {
    const text = await Clipboard.getStringAsync();
    if (text) {
      setCode(text);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  }, []);

  // ── Dry Run (real TypeScript compiler) ────────────────────────────────────

  const handleDryRun = useCallback(async () => {
    if (!code.trim()) {
      Alert.alert('Nothing to check', 'Paste some code first.');
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    setIsDryRunning(true);
    setDryRunResult(null);

    const base = getServerBase();
    if (!base) {
      Alert.alert('Server offline', 'Make sure the API server is running.');
      setIsDryRunning(false);
      return;
    }

    try {
      const resp = await fetch(`${base}/debug/typecheck`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, mode }),
      });
      const json = await resp.json() as any;
      if (!resp.ok) {
        Alert.alert('Check failed', json?.error ?? `Server error ${resp.status}`);
        return;
      }
      setDryRunResult(json);
      Haptics.notificationAsync(
        json.pass
          ? Haptics.NotificationFeedbackType.Success
          : Haptics.NotificationFeedbackType.Error,
      );
      setTimeout(() => dryRunScrollRef.current?.scrollToEnd({ animated: true }), 100);
    } catch (err: any) {
      Alert.alert('Check failed', err?.message ?? 'Unknown error');
    } finally {
      setIsDryRunning(false);
    }
  }, [code, mode]);

  const handleCopyDryRun = useCallback(async () => {
    if (!dryRunResult) return;
    const lines = dryRunResult.errors.map(
      (e) => `${e.severity.toUpperCase()} ${e.code} line ${e.line}:${e.col} — ${e.message}`,
    );
    const text = [
      `VERDICT: ${dryRunResult.verdict}`,
      dryRunResult.summary,
      '',
      ...lines,
      '',
      '--- raw ---',
      dryRunResult.rawOutput,
    ].join('\n');
    await Clipboard.setStringAsync(text);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert('Copied', 'Dry run results copied to clipboard.');
  }, [dryRunResult]);

  // ── Styles ─────────────────────────────────────────────────────────────────

  const S = {
    container: {
      flex: 1,
      paddingTop: insets.top + 8,
      paddingBottom: insets.bottom,
    },
    header: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      paddingHorizontal: 16,
      paddingBottom: 12,
      gap: 8,
    },
    headerTitle: {
      fontFamily: 'Inter_700Bold',
      fontSize: 18,
      color: theme.text,
      flex: 1,
      letterSpacing: 0.5,
    },
    badge: {
      backgroundColor: '#ff6b6b22',
      borderRadius: 6,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderWidth: 1,
      borderColor: '#ff6b6b55',
    },
    badgeText: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 10,
      color: '#ff6b6b',
      letterSpacing: 0.8,
    },
    section: {
      paddingHorizontal: 16,
      marginBottom: 12,
    },
    label: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 11,
      color: theme.textMuted,
      letterSpacing: 0.8,
      textTransform: 'uppercase' as const,
      marginBottom: 6,
    },
    modeRow: {
      flexDirection: 'row' as const,
      gap: 6,
    },
    modeBtn: (active: boolean) => ({
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 5,
      paddingHorizontal: 10,
      paddingVertical: 7,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: active ? theme.primary : theme.border,
      backgroundColor: active ? theme.primary + '22' : theme.surface,
    }),
    modeBtnText: (active: boolean) => ({
      fontFamily: 'Inter_600SemiBold',
      fontSize: 11,
      color: active ? theme.primary : theme.textMuted,
    }),
    codeBox: {
      backgroundColor: theme.surface,
      borderWidth: 1,
      borderColor: theme.border,
      borderRadius: 10,
      padding: 12,
      minHeight: 160,
      fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
      fontSize: 12,
      color: theme.text,
      textAlignVertical: 'top' as const,
    },
    codeActions: {
      flexDirection: 'row' as const,
      gap: 8,
      marginTop: 8,
    },
    smallBtn: (accent?: string) => ({
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 5,
      paddingHorizontal: 10,
      paddingVertical: 7,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: (accent ?? theme.border),
      backgroundColor: (accent ? accent + '18' : theme.surface),
    }),
    smallBtnText: (accent?: string) => ({
      fontFamily: 'Inter_600SemiBold',
      fontSize: 11,
      color: accent ?? theme.textMuted,
    }),
    analyzeBtn: {
      marginHorizontal: 16,
      marginBottom: 12,
      borderRadius: 10,
      paddingVertical: 14,
      alignItems: 'center' as const,
      flexDirection: 'row' as const,
      justifyContent: 'center' as const,
      gap: 8,
      backgroundColor: isAnalyzing ? '#ff4444' : theme.primary,
    },
    analyzeBtnText: {
      fontFamily: 'Inter_700Bold',
      fontSize: 14,
      color: '#fff',
      letterSpacing: 0.5,
    },
    resultCard: {
      marginHorizontal: 16,
      backgroundColor: theme.surface,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: theme.border,
      flex: 1,
      marginBottom: 8,
    },
    resultHeader: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderBottomWidth: 1,
      borderBottomColor: theme.border,
      gap: 6,
    },
    resultHeaderText: {
      fontFamily: 'Inter_600SemiBold',
      fontSize: 12,
      color: theme.textMuted,
      flex: 1,
    },
    resultScroll: {
      padding: 12,
      flex: 1,
    },
    emptyState: {
      alignItems: 'center' as const,
      paddingVertical: 32,
      gap: 8,
    },
    emptyText: {
      fontFamily: 'Inter_400Regular',
      fontSize: 13,
      color: theme.textMuted,
      textAlign: 'center' as const,
      maxWidth: 240,
    },
  };

  const resultLines = result.split('\n');

  return (
    <ThemedBackground>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={S.container}>
          {/* Header */}
          <View style={S.header}>
            <Text style={S.headerTitle}>Debug</Text>
            <View style={S.badge}>
              <Text style={S.badgeText}>PRE-BUILD CHECK</Text>
            </View>
          </View>

          {/* Mode selector */}
          <View style={S.section}>
            <Text style={S.label}>Code type</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={S.modeRow}>
                {CONTEXT_OPTIONS.map((opt) => (
                  <TouchableOpacity
                    key={opt.key}
                    onPress={() => { setMode(opt.key); Haptics.selectionAsync(); }}
                    style={S.modeBtn(mode === opt.key)}
                  >
                    <Feather name={opt.icon as any} size={12} color={mode === opt.key ? theme.primary : theme.textMuted} />
                    <Text style={S.modeBtnText(mode === opt.key)}>{opt.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          </View>

          {/* Code input */}
          <View style={S.section}>
            <Text style={S.label}>Paste code here</Text>
            <TextInput
              style={S.codeBox}
              value={code}
              onChangeText={setCode}
              multiline
              placeholder={'// Paste the code Whiz or Vhiz wants to build…\n// Tap Analyze to check for errors before running EAS.'}
              placeholderTextColor={theme.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              spellCheck={false}
            />
            <View style={S.codeActions}>
              <TouchableOpacity onPress={handlePasteCode} style={S.smallBtn(theme.primary)}>
                <Feather name="clipboard" size={12} color={theme.primary} />
                <Text style={S.smallBtnText(theme.primary)}>Paste</Text>
              </TouchableOpacity>
              {code.length > 0 && (
                <TouchableOpacity onPress={handleClear} style={S.smallBtn()}>
                  <Feather name="x" size={12} color={theme.textMuted} />
                  <Text style={S.smallBtnText()}>Clear all</Text>
                </TouchableOpacity>
              )}
              {code.length > 0 && (
                <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 10, color: theme.textMuted, alignSelf: 'center', marginLeft: 'auto' }}>
                  {code.length} chars
                </Text>
              )}
            </View>
          </View>

          {/* Action buttons row */}
          <View style={{ flexDirection: 'row', paddingHorizontal: 16, gap: 8, marginBottom: 12 }}>
            {/* AI Analyze */}
            <TouchableOpacity
              style={[S.analyzeBtn, { flex: 1, marginHorizontal: 0, marginBottom: 0 }]}
              onPress={isAnalyzing ? handleStop : handleAnalyze}
              activeOpacity={0.8}
            >
              {isAnalyzing ? (
                <>
                  <ActivityIndicator size="small" color="#fff" />
                  <Text style={S.analyzeBtnText}>Stop</Text>
                </>
              ) : (
                <>
                  <Feather name="zap" size={15} color="#fff" />
                  <Text style={S.analyzeBtnText}>AI Analyze</Text>
                </>
              )}
            </TouchableOpacity>

            {/* Dry Run — real tsc */}
            <TouchableOpacity
              style={{
                flex: 1,
                borderRadius: 10,
                paddingVertical: 14,
                alignItems: 'center',
                flexDirection: 'row',
                justifyContent: 'center',
                gap: 7,
                backgroundColor: isDryRunning ? '#f59e0b' : '#f59e0b22',
                borderWidth: 1.5,
                borderColor: '#f59e0b',
              }}
              onPress={isDryRunning ? undefined : handleDryRun}
              activeOpacity={0.8}
              disabled={isDryRunning}
            >
              {isDryRunning ? (
                <>
                  <ActivityIndicator size="small" color="#f59e0b" />
                  <Text style={[S.analyzeBtnText, { color: '#f59e0b' }]}>Running…</Text>
                </>
              ) : (
                <>
                  <Feather name="cpu" size={15} color="#f59e0b" />
                  <Text style={[S.analyzeBtnText, { color: '#f59e0b' }]}>Dry Run</Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          {/* Results */}
          <View style={S.resultCard}>
            <View style={S.resultHeader}>
              <Feather name="terminal" size={13} color={theme.textMuted} />
              <Text style={S.resultHeaderText}>
                {isAnalyzing ? 'Analyzing…' : result ? 'Analysis complete' : 'Results will appear here'}
              </Text>
              {result.length > 0 && !isAnalyzing && (
                <TouchableOpacity onPress={handleCopyResult} style={{ padding: 4 }}>
                  <Feather name="copy" size={14} color={theme.textMuted} />
                </TouchableOpacity>
              )}
            </View>

            <ScrollView
              ref={resultScrollRef}
              style={S.resultScroll}
              showsVerticalScrollIndicator
            >
              {result ? (
                resultLines.map((line, i) => (
                  <Text
                    key={i}
                    style={{
                      fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
                      fontSize: 12,
                      color: lineColor(line, theme),
                      lineHeight: 20,
                      marginBottom: line === '' ? 4 : 0,
                    }}
                    selectable
                  >
                    {line || ' '}
                  </Text>
                ))
              ) : (
                <View style={S.emptyState}>
                  <Feather name="search" size={28} color={theme.textMuted} />
                  <Text style={S.emptyText}>
                    Paste Whiz or Vhiz's code above and tap Analyze to find errors before wasting an EAS build.
                  </Text>
                </View>
              )}
              <View style={{ height: 24 }} />
            </ScrollView>
          </View>

          {/* Dry Run results */}
          {dryRunResult && (
            <View style={[S.resultCard, { marginBottom: 8, flexShrink: 1, maxHeight: 280 }]}>
              <View style={S.resultHeader}>
                {/* Verdict badge */}
                <View style={{
                  paddingHorizontal: 8,
                  paddingVertical: 3,
                  borderRadius: 6,
                  backgroundColor:
                    dryRunResult.verdict === 'CLEAN' ? '#34d39922' :
                    dryRunResult.verdict === 'WARNINGS_ONLY' ? '#fbbf2422' : '#ff6b6b22',
                  borderWidth: 1,
                  borderColor:
                    dryRunResult.verdict === 'CLEAN' ? '#34d399' :
                    dryRunResult.verdict === 'WARNINGS_ONLY' ? '#fbbf24' : '#ff6b6b',
                  marginRight: 4,
                }}>
                  <Text style={{
                    fontFamily: 'Inter_700Bold',
                    fontSize: 10,
                    letterSpacing: 0.8,
                    color:
                      dryRunResult.verdict === 'CLEAN' ? '#34d399' :
                      dryRunResult.verdict === 'WARNINGS_ONLY' ? '#fbbf24' : '#ff6b6b',
                  }}>
                    {dryRunResult.verdict === 'CLEAN' ? '✅ CLEAN' :
                     dryRunResult.verdict === 'WARNINGS_ONLY' ? '⚠️ WARNINGS' : '🚫 ERRORS'}
                  </Text>
                </View>
                <Text style={[S.resultHeaderText, { flex: 1 }]} numberOfLines={1}>
                  tsc · {dryRunResult.errors.length} issue{dryRunResult.errors.length !== 1 ? 's' : ''} · {dryRunResult.durationMs}ms
                </Text>
                <TouchableOpacity onPress={handleCopyDryRun} style={{ padding: 4 }}>
                  <Feather name="copy" size={14} color={theme.textMuted} />
                </TouchableOpacity>
              </View>

              {/* Summary line */}
              <View style={{ paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: theme.border }}>
                <Text style={{ fontFamily: 'Inter_600SemiBold', fontSize: 12, color: theme.text }}>
                  {dryRunResult.summary}
                </Text>
              </View>

              <ScrollView ref={dryRunScrollRef} style={S.resultScroll} showsVerticalScrollIndicator>
                {dryRunResult.errors.length === 0 ? (
                  <Text style={{ fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 12, color: '#34d399', lineHeight: 20 }}>
                    No TypeScript errors found. Safe to build.
                  </Text>
                ) : (
                  dryRunResult.errors.map((err, i) => (
                    <View key={i} style={{ marginBottom: 10 }}>
                      <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center', marginBottom: 2 }}>
                        <Text style={{ fontFamily: 'Inter_700Bold', fontSize: 11, color: err.severity === 'error' ? '#ff6b6b' : '#fbbf24' }}>
                          {err.severity === 'error' ? '🔴' : '🟡'} Line {err.line}:{err.col}
                        </Text>
                        <Text style={{ fontFamily: 'Inter_400Regular', fontSize: 10, color: theme.textMuted }}>
                          {err.code}
                        </Text>
                      </View>
                      <Text style={{ fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 12, color: theme.text, lineHeight: 18 }} selectable>
                        {err.message}
                      </Text>
                    </View>
                  ))
                )}
                <View style={{ height: 12 }} />
              </ScrollView>
            </View>
          )}

        </View>
      </KeyboardAvoidingView>
    </ThemedBackground>
  );
}
