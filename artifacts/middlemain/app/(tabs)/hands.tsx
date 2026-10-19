import AsyncStorage from '@react-native-async-storage/async-storage';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import { ThemedBackground } from '@/components/ThemedBackground';
import { HumanHandsVault } from '@/components/HumanHandsVault';
import { useAI, type AIConnection, type ChatMessage } from '@/context/AIContext';
import { useTheme } from '@/context/ThemeContext';
import {
  containsCredentialMaterial,
  normalizeHttpsUrl,
  parseChecklistSteps,
  type HumanHandsTask,
} from '@/utils/humanHands';
import { useRouter } from 'expo-router';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

const TASKS_KEY = '@middlemain_human_hands_tasks_v1';
const MAX_TASKS = 12;
const PLAN_PROMPT = `You are Human Hands, Middlemain's setup guide. The user must perform every action themselves.
Give 4 to 8 short, numbered steps for the stated service and goal. Use only the provided URL as the user's chosen destination; do not invent deep links. State clearly when a step requires the user to sign in, complete email/device verification, accept legal terms, enter payment information, or grant permission. Never ask for or repeat passwords, API keys, recovery codes, one-time codes, payment details, or other secrets. Do not claim you created an account, connected a service, submitted a form, or verified anything. If the service requirements may have changed, tell the user to check the official site.`;

type AppTheme = ReturnType<typeof useTheme>['theme'];
type ScreenMode = 'tasks' | 'vault';

function stylesFor(theme: AppTheme) {
  return StyleSheet.create({
    page: { flexGrow: 1, paddingHorizontal: 16, paddingTop: 18, paddingBottom: 116 },
    header: { alignItems: 'center' as const, flexDirection: 'row' as const, gap: 12, marginBottom: 8 },
    title: { color: theme.text, fontFamily: 'Inter_700Bold', fontSize: 23, letterSpacing: 1.2 },
    subtitle: { color: theme.textMuted, fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 19, marginTop: 4 },
    segmented: {
      backgroundColor: theme.surface,
      borderColor: theme.border,
      borderRadius: theme.radius,
      borderWidth: 1,
      flexDirection: 'row' as const,
      marginTop: 16,
      padding: 4,
    },
    segment: { alignItems: 'center' as const, borderRadius: theme.radius, flex: 1, flexDirection: 'row' as const, gap: 7, justifyContent: 'center' as const, minHeight: 40 },
    card: {
      backgroundColor: theme.card,
      borderColor: theme.border,
      borderRadius: theme.radius,
      borderWidth: 1,
      marginTop: 14,
      padding: 15,
    },
    cardTitle: { color: theme.text, fontFamily: 'Inter_600SemiBold', fontSize: 16 },
    body: { color: theme.textMuted, fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 18, marginTop: 7 },
    label: { color: theme.textMuted, fontFamily: 'Inter_600SemiBold', fontSize: 10, letterSpacing: 1.1, marginBottom: 5, marginTop: 13 },
    input: { backgroundColor: theme.surface, borderColor: theme.border, borderRadius: theme.radius, borderWidth: 1, color: theme.text, fontFamily: 'Inter_400Regular', fontSize: 14, minHeight: 45, paddingHorizontal: 12, paddingVertical: 10 },
    multiline: { minHeight: 92, textAlignVertical: 'top' as const },
    row: { alignItems: 'center' as const, flexDirection: 'row' as const, gap: 8 },
    chips: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 7, marginTop: 8 },
    chip: { borderColor: theme.border, borderRadius: 18, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 7 },
    notice: { backgroundColor: theme.surface, borderColor: theme.border, borderRadius: theme.radius, borderWidth: 1, marginTop: 12, padding: 11 },
    primaryButton: { alignItems: 'center' as const, backgroundColor: theme.primary, borderRadius: theme.radius, flexDirection: 'row' as const, gap: 8, justifyContent: 'center' as const, minHeight: 46, marginTop: 14, paddingHorizontal: 14 },
    secondaryButton: { alignItems: 'center' as const, borderColor: theme.border, borderRadius: theme.radius, borderWidth: 1, flexDirection: 'row' as const, gap: 7, justifyContent: 'center' as const, minHeight: 40, paddingHorizontal: 11 },
    buttonText: { color: theme.background, fontFamily: 'Inter_600SemiBold', fontSize: 13 },
    secondaryText: { color: theme.text, fontFamily: 'Inter_600SemiBold', fontSize: 12 },
    checkbox: { alignItems: 'center' as const, borderColor: theme.primary, borderRadius: 4, borderWidth: 1, height: 21, justifyContent: 'center' as const, marginTop: 1, width: 21 },
    error: { color: theme.destructive, fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 18, marginTop: 10 },
    taskCard: { backgroundColor: theme.card, borderColor: theme.border, borderRadius: theme.radius, borderWidth: 1, marginTop: 12, padding: 14 },
    taskTitle: { color: theme.text, flex: 1, fontFamily: 'Inter_600SemiBold', fontSize: 15 },
    taskMeta: { color: theme.textMuted, fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 4 },
    stepRow: { alignItems: 'flex-start' as const, borderTopColor: theme.border, borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row' as const, gap: 9, paddingVertical: 11 },
    stepText: { color: theme.text, flex: 1, fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 19 },
    empty: { alignItems: 'center' as const, paddingVertical: 18 },
  });
}

function taskId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function validateStoredTasks(raw: string | null): HumanHandsTask[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((task): task is HumanHandsTask =>
      task &&
      typeof task.id === 'string' &&
      typeof task.service === 'string' &&
      typeof task.website === 'string' &&
      typeof task.goal === 'string' &&
      Array.isArray(task.steps) &&
      task.steps.every((step: unknown) =>
        !!step &&
        typeof step === 'object' &&
        'text' in step &&
        typeof step.text === 'string' &&
        'done' in step &&
        typeof step.done === 'boolean',
      ),
    ).slice(0, MAX_TASKS);
  } catch {
    return [];
  }
}

export default function HumanHandsScreen() {
  const { theme } = useTheme();
  const styles = useMemo(() => stylesFor(theme), [theme]);
  const router = useRouter();
  const { connections, activeConnection, sendMessage } = useAI();
  const [mode, setMode] = useState<ScreenMode>('tasks');
  const [tasks, setTasks] = useState<HumanHandsTask[]>([]);
  const [service, setService] = useState('');
  const [website, setWebsite] = useState('');
  const [goal, setGoal] = useState('');
  const [connectionId, setConnectionId] = useState('');
  const [consent, setConsent] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [confirmDeleteTaskId, setConfirmDeleteTaskId] = useState<string | null>(null);
  const answerRef = useRef('');
  const mountedRef = useRef(true);
  const selectedConnection = connections.find((connection) => connection.id === connectionId)
    ?? activeConnection
    ?? connections[0]
    ?? null;

  useEffect(() => {
    mountedRef.current = true;
    AsyncStorage.getItem(TASKS_KEY)
      .then((raw) => {
        if (mountedRef.current) setTasks(validateStoredTasks(raw));
      })
      .catch(() => {
        if (mountedRef.current) setError('Saved setup plans could not be loaded.');
      })
      .finally(() => {
        if (mountedRef.current) setLoading(false);
      });
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (!connectionId && activeConnection) setConnectionId(activeConnection.id);
  }, [activeConnection, connectionId]);

  const persistTasks = useCallback(async (next: HumanHandsTask[]) => {
    try {
      await AsyncStorage.setItem(TASKS_KEY, JSON.stringify(next));
      if (mountedRef.current) setTasks(next);
    } catch {
      if (mountedRef.current) setError('Could not save this plan on your phone.');
    }
  }, []);

  const handleGenerate = useCallback(async () => {
    setError('');
    setNotice('');
    if (!selectedConnection) {
      setError('Connect an AI on the Connect tab before asking it for a setup checklist.');
      return;
    }
    if (!service.trim() || !goal.trim()) {
      setError('Enter the service and what you need to finish.');
      return;
    }
    if (containsCredentialMaterial(`${service}\n${website}\n${goal}`)) {
      setError('That text looks like it may contain a password, key, or verification code. Remove it; Human Hands will not send or save it.');
      return;
    }
    const normalizedWebsite = normalizeHttpsUrl(website);
    if (website.trim() && !normalizedWebsite) {
      setError('Enter a valid HTTPS website address without a username or password.');
      return;
    }
    if (!consent) {
      setError('Confirm the cost and privacy notice before sending this request.');
      return;
    }
    if (tasks.length >= MAX_TASKS) {
      setError(`Complete or delete a plan before adding more than ${MAX_TASKS}.`);
      return;
    }

    const prompt = [
      `Service: ${service.trim()}`,
      `Website supplied by the user: ${normalizedWebsite || 'No website supplied'}`,
      `Goal: ${goal.trim()}`,
    ].join('\n');
    answerRef.current = '';
    setAnswer('');
    setBusy(true);
    const messages: ChatMessage[] = [{ role: 'user', content: prompt }];

    try {
      await sendMessage(
        selectedConnection.id,
        messages,
        (chunk) => {
          answerRef.current += chunk;
          if (mountedRef.current) setAnswer(answerRef.current);
        },
        () => {
          if (!mountedRef.current) return;
          const steps = parseChecklistSteps(answerRef.current);
          if (steps.length === 0) {
            setError('The AI did not return a usable checklist. Review its response and try again only if you choose.');
            setBusy(false);
            return;
          }
          const newTask: HumanHandsTask = {
            id: taskId(),
            service: service.trim(),
            website: normalizedWebsite || '',
            goal: goal.trim(),
            steps,
            createdAt: new Date().toISOString(),
          };
          void persistTasks([newTask, ...tasks]);
          setAnswer('');
          setGoal('');
          setConsent(false);
          setNotice(`Checklist created with ${selectedConnection.name}. Verify each step on the official site.`);
          setBusy(false);
        },
        (message) => {
          if (!mountedRef.current) return;
          setError(message);
          setBusy(false);
        },
        undefined,
        PLAN_PROMPT,
      );
    } catch {
      if (mountedRef.current) {
        setError('The AI request failed. It may already have been billed; no automatic retry was sent.');
        setBusy(false);
      }
    }
  }, [selectedConnection, service, website, goal, consent, tasks, sendMessage, persistTasks]);

  const toggleStep = useCallback((task: HumanHandsTask, stepIndex: number) => {
    const next = tasks.map((saved) => saved.id !== task.id ? saved : {
      ...saved,
      steps: saved.steps.map((step, index) => index === stepIndex ? { ...step, done: !step.done } : step),
    });
    void persistTasks(next);
  }, [tasks, persistTasks]);

  const removeTask = useCallback((id: string) => {
    void persistTasks(tasks.filter((task) => task.id !== id));
    setConfirmDeleteTaskId(null);
  }, [tasks, persistTasks]);

  const openWebsite = async (value: string) => {
    const safeUrl = normalizeHttpsUrl(value);
    if (!safeUrl) {
      setError('This saved website address is not a valid HTTPS link.');
      return;
    }
    try {
      await Linking.openURL(safeUrl);
    } catch {
      setError('Could not open that website on this device.');
    }
  };

  const credentialDetected = containsCredentialMaterial(`${service}\n${website}\n${goal}`);

  return (
    <ThemedBackground>
      <KeyboardAwareScrollView
        style={{ flex: 1 }}
        contentContainerStyle={styles.page}
        keyboardShouldPersistTaps="handled"
        bottomOffset={104}
      >
        <View style={styles.header}>
          <MaterialCommunityIcons name="hand-wave-outline" size={30} color={theme.primary} />
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>HUMAN HANDS</Text>
            <Text style={styles.subtitle}>Setup help, with you in control.</Text>
          </View>
        </View>

        <View style={styles.segmented} accessibilityRole="radiogroup">
          {([
            { id: 'tasks' as const, label: 'Setup tasks', icon: 'list' as const },
            { id: 'vault' as const, label: 'Secrets vault', icon: 'lock' as const },
          ]).map((option) => {
            const selected = mode === option.id;
            return (
              <Pressable
                key={option.id}
                onPress={() => { setMode(option.id); setError(''); setNotice(''); }}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                style={[
                  styles.segment,
                  selected && { backgroundColor: theme.primary + '22' },
                ]}
              >
                <Feather name={option.icon} size={15} color={selected ? theme.primary : theme.textMuted} />
                <Text style={{ color: selected ? theme.primary : theme.textMuted, fontFamily: 'Inter_600SemiBold', fontSize: 12 }}>
                  {option.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {mode === 'vault' ? (
          <HumanHandsVault />
        ) : (
          <>
            <View style={styles.card}>
              <View style={styles.row}>
                <MaterialCommunityIcons name="clipboard-list-outline" size={20} color={theme.primary} />
                <Text style={styles.cardTitle}>What are you trying to set up?</Text>
              </View>
              <Text style={styles.body}>
                Name the service and goal. Human Hands can draft a checklist; you open the official site and do the sign-in, verification, payment, and final approvals.
              </Text>

              <Text style={styles.label}>SERVICE</Text>
              <TextInput
                value={service}
                onChangeText={(value) => { setService(value); setConsent(false); }}
                placeholder="Apple Developer, GitHub, or another service"
                placeholderTextColor={theme.textMuted}
                style={styles.input}
                maxLength={100}
                autoCapitalize="sentences"
              />
              <Text style={styles.label}>OFFICIAL WEBSITE (OPTIONAL)</Text>
              <TextInput
                value={website}
                onChangeText={(value) => { setWebsite(value); setConsent(false); }}
                placeholder="https://developer.apple.com"
                placeholderTextColor={theme.textMuted}
                style={styles.input}
                maxLength={300}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
              />
              <Text style={styles.label}>WHAT DO YOU NEED TO FINISH?</Text>
              <TextInput
                value={goal}
                onChangeText={(value) => { setGoal(value); setConsent(false); }}
                placeholder="For example: create an App Store Connect API key"
                placeholderTextColor={theme.textMuted}
                style={[styles.input, styles.multiline]}
                multiline
                maxLength={700}
                autoCapitalize="sentences"
                textAlignVertical="top"
              />

              <Text style={styles.label}>AI CONNECTION</Text>
              {connections.length === 0 ? (
                <Pressable
                  onPress={() => router.push('/(tabs)/connections')}
                  accessibilityRole="button"
                  style={styles.secondaryButton}
                >
                  <Feather name="link" size={14} color={theme.primary} />
                  <Text style={[styles.secondaryText, { color: theme.primary }]}>Open Connect</Text>
                </Pressable>
              ) : (
                <View style={styles.chips}>
                  {connections.map((connection: AIConnection) => {
                    const selected = selectedConnection?.id === connection.id;
                    return (
                      <Pressable
                        key={connection.id}
                        onPress={() => { setConnectionId(connection.id); setConsent(false); }}
                        accessibilityRole="radio"
                        accessibilityState={{ selected }}
                        style={[
                          styles.chip,
                          selected && { borderColor: theme.primary, backgroundColor: theme.primary + '22' },
                        ]}
                      >
                        <Text style={{ color: selected ? theme.primary : theme.textMuted, fontFamily: 'Inter_500Medium', fontSize: 11 }}>
                          {connection.name}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              )}

              <View style={styles.notice}>
                <View style={styles.row}>
                  <Feather name="shield" size={15} color={theme.primary} />
                  <Text style={[styles.cardTitle, { fontSize: 13 }]}>Before asking AI</Text>
                </View>
                <Text style={styles.body}>
                  The service, website, and goal above are sent as written to the selected AI; its provider may charge for the request. Vault entries are never read. Do not put passwords, API keys, recovery codes, payment details, or verification codes in these fields.
                </Text>
                <Pressable
                  onPress={() => setConsent((value) => !value)}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: consent }}
                  style={[styles.row, { alignItems: 'flex-start', marginTop: 11 }]}
                >
                  <View style={styles.checkbox}>
                    {consent ? <Feather name="check" size={14} color={theme.primary} /> : null}
                  </View>
                  <Text style={[styles.body, { flex: 1, marginTop: 0 }]}>
                    I checked the text for secrets and approve sending this setup request to {selectedConnection?.name ?? 'my selected AI'}; charges may apply.
                  </Text>
                </Pressable>
              </View>

              {credentialDetected ? (
                <Text accessibilityRole="alert" style={styles.error}>
                  This looks like it may contain a password, key, or verification code. Remove it before continuing.
                </Text>
              ) : null}
              {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
              {notice ? <Text accessibilityLiveRegion="polite" style={{ ...styles.body, color: theme.primary }}>{notice}</Text> : null}

              <Pressable
                onPress={handleGenerate}
                disabled={busy || !consent || !selectedConnection || credentialDetected}
                accessibilityRole="button"
                style={[styles.primaryButton, (busy || !consent || !selectedConnection || credentialDetected) && { opacity: 0.5 }]}
              >
                <Feather name={busy ? 'loader' : 'list'} size={16} color={theme.background} />
                <Text style={styles.buttonText}>{busy ? 'Building checklist…' : 'Ask AI for steps · may be billed'}</Text>
              </Pressable>
            </View>

            {busy || answer ? (
              <View style={styles.card}>
                <Text style={styles.cardTitle}>{busy ? `Waiting for ${selectedConnection?.name ?? 'AI'}…` : 'AI response'}</Text>
                <Text style={styles.body}>{answer || 'Preparing your checklist…'}</Text>
              </View>
            ) : null}

            <View style={[styles.row, { justifyContent: 'space-between', marginTop: 19 }]}>
              <Text style={styles.cardTitle}>Your setup plans</Text>
              <Text style={styles.taskMeta}>{tasks.length}/{MAX_TASKS}</Text>
            </View>
            {loading ? (
              <Text style={styles.body}>Loading saved plans…</Text>
            ) : tasks.length === 0 ? (
              <View style={styles.empty}>
                <MaterialCommunityIcons name="hand-wave-outline" size={26} color={theme.textMuted} />
                <Text style={styles.body}>Your checklists will appear here and stay on this device.</Text>
              </View>
            ) : (
              tasks.map((task) => (
                <View key={task.id} style={styles.taskCard}>
                  <View style={styles.row}>
                    <Text style={styles.taskTitle}>{task.service}</Text>
                    <Pressable
                      onPress={() => setConfirmDeleteTaskId(task.id)}
                      accessibilityRole="button"
                      accessibilityLabel={`Delete ${task.service} setup plan`}
                      hitSlop={8}
                    >
                      <Feather name="trash-2" size={17} color={theme.destructive} />
                    </Pressable>
                  </View>
                  {confirmDeleteTaskId === task.id ? (
                    <View style={[styles.row, { marginTop: 9 }]}>
                      <Text style={[styles.body, { flex: 1, marginTop: 0 }]}>Delete this checklist and its progress?</Text>
                      <Pressable onPress={() => removeTask(task.id)} accessibilityRole="button">
                        <Text style={[styles.secondaryText, { color: theme.destructive }]}>Delete</Text>
                      </Pressable>
                      <Pressable onPress={() => setConfirmDeleteTaskId(null)} accessibilityRole="button">
                        <Text style={styles.secondaryText}>Keep</Text>
                      </Pressable>
                    </View>
                  ) : null}
                  <Text style={styles.taskMeta}>{task.goal}</Text>
                  {task.website ? (
                    <Pressable onPress={() => openWebsite(task.website)} style={[styles.secondaryButton, { alignSelf: 'flex-start', marginTop: 10 }]}>
                      <Feather name="external-link" size={14} color={theme.primary} />
                      <Text style={[styles.secondaryText, { color: theme.primary }]}>Open {normalizeHttpsUrl(task.website) ? new URL(task.website).hostname : 'site'}</Text>
                    </Pressable>
                  ) : null}
                  <View style={{ marginTop: 11 }}>
                    {task.steps.map((step, index) => (
                      <Pressable
                        key={`${task.id}-${index}`}
                        onPress={() => toggleStep(task, index)}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: step.done }}
                        style={styles.stepRow}
                      >
                        <Feather name={step.done ? 'check-square' : 'square'} size={18} color={step.done ? theme.primary : theme.textMuted} />
                        <Text style={[styles.stepText, step.done && { color: theme.textMuted, textDecorationLine: 'line-through' }]}>
                          {step.text}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              ))
            )}
            <Text style={[styles.body, { marginTop: 13 }]}>
              Guidance can be out of date. Verify steps on the service’s official site. Human Hands does not create accounts or complete verification for you.
            </Text>
          </>
        )}
      </KeyboardAwareScrollView>
    </ThemedBackground>
  );
}
