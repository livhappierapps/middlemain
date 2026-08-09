import { Feather } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import * as Sharing from 'expo-sharing';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  AppStateStatus,
  Clipboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { captureRef } from 'react-native-view-shot';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NeonCard } from '@/components/NeonCard';
import { NeonText } from '@/components/NeonText';
import { ThemedBackground } from '@/components/ThemedBackground';
import { NeonButton } from '@/components/NeonButton';
import {
  CouncilParticipant,
  COUNCIL_COLORS,
  useCouncil,
} from '@/context/CouncilContext';
import { AIProvider, PROVIDER_DEFAULTS } from '@/context/AIContext';
import { useTheme } from '@/context/ThemeContext';
import { useMCP } from '@/context/MCPContext';

const VISION_INTERVAL_MS = 3000;

const PROVIDERS: { key: AIProvider; label: string }[] = [
  { key: 'xai', label: 'Grok (xAI)' },
  { key: 'openai', label: 'OpenAI' },
  { key: 'anthropic', label: 'Anthropic' },
  { key: 'server', label: 'Dev Server' },
  { key: 'custom', label: 'Custom' },
];

// ─── Add Participant Modal ────────────────────────────────────────────────────
const AGENT_PRESETS: { label: string; prompt: string }[] = [
  {
    label: '🤖 Dev Agent',
    prompt: 'You are a senior software engineer and Replit dev agent. You write clean, efficient code, debug issues methodically, and explain your reasoning. Stay focused on implementation.',
  },
  {
    label: '🔍 Code Reviewer',
    prompt: 'You are a strict but constructive code reviewer. Identify bugs, security issues, performance problems, and style violations. Be specific and suggest concrete fixes.',
  },
  {
    label: '🧠 Research Agent',
    prompt: 'You are a research and analysis agent. You break down complex topics, synthesize information, and provide well-structured summaries. Cite your reasoning clearly.',
  },
  {
    label: '🎯 Product Agent',
    prompt: 'You are a product manager and UX strategist. You think in terms of user needs, priorities, and outcomes. Push back on over-engineering and keep focus on what matters.',
  },
  {
    label: '🛡️ Security Agent',
    prompt: 'You are a cybersecurity expert. You audit code and systems for vulnerabilities, suggest hardening strategies, and think like an attacker to protect like a defender.',
  },
  {
    label: '✏️ Custom',
    prompt: '',
  },
];

const DEFAULT_SYSTEM_PROMPT = 'You are an AI participant in a multi-agent council. Collaborate with other AIs and the user to solve problems together.';

function AddParticipantModal({
  visible,
  onClose,
  onAdd,
  usedColors,
}: {
  visible: boolean;
  onClose: () => void;
  onAdd: (data: Omit<CouncilParticipant, 'id' | 'session' | 'sessionLoading' | 'hearingOn' | 'cameraOn' | 'screenOn' | 'isAutoLoaded' | 'sessionError'>) => void;
  usedColors: string[];
}) {
  const { theme } = useTheme();
  const [provider, setProvider] = useState<AIProvider>('xai');
  const [name, setName] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState(PROVIDER_DEFAULTS['xai'].model);
  const [baseUrl, setBaseUrl] = useState('');
  const [systemPrompt, setSystemPrompt] = useState(DEFAULT_SYSTEM_PROMPT);
  const [activePreset, setActivePreset] = useState<string | null>(null);

  const inputStyle = {
    backgroundColor: theme.surface + 'E6',
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: theme.radius,
    color: theme.text,
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginTop: 6,
  };

  const labelStyle = {
    color: theme.textMuted,
    fontSize: 10,
    fontFamily: 'Inter_600SemiBold',
    letterSpacing: 1.5,
    marginTop: 14,
  };

  const handleProviderChange = (p: AIProvider) => {
    setProvider(p);
    setModel(PROVIDER_DEFAULTS[p]?.model ?? '');
    setBaseUrl(PROVIDER_DEFAULTS[p]?.baseUrl ?? '');
  };

  const handlePreset = (preset: { label: string; prompt: string }) => {
    setActivePreset(preset.label);
    if (preset.prompt) setSystemPrompt(preset.prompt);
    else setSystemPrompt('');
  };

  const handleAdd = () => {
    if (!name.trim()) { Alert.alert('Required', 'Enter a display name.'); return; }
    if (!apiKey.trim() && provider !== 'server') { Alert.alert('Required', 'Enter an API key.'); return; }
    if (!model.trim()) { Alert.alert('Required', 'Enter a model name.'); return; }
    const color = COUNCIL_COLORS.find((c) => !usedColors.includes(c)) ?? COUNCIL_COLORS[usedColors.length % COUNCIL_COLORS.length];
    onAdd({
      displayName: name.trim(),
      provider,
      apiKey: apiKey.trim(),
      model: model.trim(),
      baseUrl: baseUrl.trim() || PROVIDER_DEFAULTS[provider]?.baseUrl || '',
      systemPrompt: systemPrompt.trim() || DEFAULT_SYSTEM_PROMPT,
      color,
    });
    setName(''); setApiKey(''); setModel(PROVIDER_DEFAULTS['xai'].model); setBaseUrl('');
    setSystemPrompt(DEFAULT_SYSTEM_PROMPT); setActivePreset(null); setProvider('xai');
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: '#00000088', justifyContent: 'flex-end' }}>
        <View style={{ backgroundColor: theme.background, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: Platform.OS === 'ios' ? 40 : 20, maxHeight: '92%' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <NeonText size={16} weight="700" letterSpacing={2}>ADD PARTICIPANT</NeonText>
            <TouchableOpacity onPress={onClose}><Feather name="x" size={22} color={theme.textMuted} /></TouchableOpacity>
          </View>
          <Text style={{ color: theme.textMuted, fontSize: 11, fontFamily: 'Inter_400Regular', marginBottom: 12 }}>
            Same model + different system prompt = different agent
          </Text>
          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            <Text style={labelStyle}>PROVIDER</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
              {PROVIDERS.map((p) => (
                <TouchableOpacity
                  key={p.key}
                  onPress={() => handleProviderChange(p.key)}
                  style={{
                    paddingHorizontal: 12, paddingVertical: 8, borderRadius: theme.radius, borderWidth: 1,
                    borderColor: provider === p.key ? theme.primary : theme.border,
                    backgroundColor: provider === p.key ? theme.primary + '22' : 'transparent',
                  }}
                >
                  <Text style={{ color: provider === p.key ? theme.primary : theme.textMuted, fontSize: 12, fontFamily: 'Inter_600SemiBold' }}>{p.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={labelStyle}>DISPLAY NAME</Text>
            <TextInput style={inputStyle} value={name} onChangeText={setName} placeholder="Boss, Whiz, Dev Agent…" placeholderTextColor={theme.textMuted} />

            <Text style={labelStyle}>API KEY</Text>
            <TextInput style={inputStyle} value={apiKey} onChangeText={setApiKey} placeholder="sk-ant-… / sk-… / xai-…" placeholderTextColor={theme.textMuted} secureTextEntry autoCapitalize="none" autoCorrect={false} />

            <Text style={labelStyle}>MODEL</Text>
            <TextInput style={inputStyle} value={model} onChangeText={setModel} placeholder="claude-opus-4-5 / gpt-4o / grok-3" placeholderTextColor={theme.textMuted} autoCapitalize="none" autoCorrect={false} />

            {(provider === 'custom' || provider === 'server') && (
              <>
                <Text style={labelStyle}>BASE URL</Text>
                <TextInput style={inputStyle} value={baseUrl} onChangeText={setBaseUrl} placeholder="https://api.example.com/v1" placeholderTextColor={theme.textMuted} autoCapitalize="none" autoCorrect={false} keyboardType="url" />
              </>
            )}

            <Text style={labelStyle}>AGENT ROLE — QUICK PRESETS</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 6 }}>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {AGENT_PRESETS.map((preset) => (
                  <TouchableOpacity
                    key={preset.label}
                    onPress={() => handlePreset(preset)}
                    style={{
                      paddingHorizontal: 12, paddingVertical: 8, borderRadius: theme.radius, borderWidth: 1,
                      borderColor: activePreset === preset.label ? theme.secondary : theme.border,
                      backgroundColor: activePreset === preset.label ? theme.secondary + '22' : 'transparent',
                    }}
                  >
                    <Text style={{ color: activePreset === preset.label ? theme.secondary : theme.textMuted, fontSize: 12, fontFamily: 'Inter_600SemiBold' }}>{preset.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            <Text style={labelStyle}>SYSTEM PROMPT</Text>
            <TextInput
              style={[inputStyle, { height: 110, textAlignVertical: 'top', paddingTop: 12 }]}
              value={systemPrompt}
              onChangeText={(t) => { setSystemPrompt(t); setActivePreset(null); }}
              placeholder="Define this agent's role, personality, and focus…"
              placeholderTextColor={theme.textMuted}
              multiline
              autoCapitalize="sentences"
              autoCorrect
            />
            <Text style={{ color: theme.textMuted, fontSize: 10, fontFamily: 'Inter_400Regular', marginTop: 4 }}>
              💡 This is what makes two Claude instances behave as completely different agents.
            </Text>

            <View style={{ flexDirection: 'row', gap: 10, marginTop: 24, marginBottom: 8 }}>
              <NeonButton label="Cancel" onPress={onClose} variant="ghost" style={{ flex: 1 }} fullWidth />
              <NeonButton label="Add to Council" onPress={handleAdd} variant="primary" style={{ flex: 1 }} fullWidth />
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ─── Participant Card ─────────────────────────────────────────────────────────
function ParticipantCard({
  participant,
  onToggleHearing,
  onToggleCamera,
  onToggleScreen,
  onRemove,
}: {
  participant: CouncilParticipant;
  onToggleHearing: () => void;
  onToggleCamera: () => void;
  onToggleScreen: () => void;
  onRemove: () => void;
}) {
  const { theme } = useTheme();
  const initials = participant.displayName
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <NeonCard accentColor={participant.color} style={{ width: 130, padding: 10, marginRight: 10 }}>
      {/* Avatar */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: participant.color + '33', borderWidth: 1.5, borderColor: participant.color, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: participant.color, fontSize: 11, fontFamily: 'Inter_700Bold' }}>{initials}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text numberOfLines={1} style={{ color: participant.color, fontSize: 11, fontFamily: 'Inter_600SemiBold' }}>{participant.displayName}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2 }}>
            <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: participant.sessionError ? '#ff4444' : participant.session ? participant.color : theme.textMuted }} />
            <Text style={{ color: participant.sessionError ? '#ff4444' : theme.textMuted, fontSize: 8, fontFamily: 'Inter_400Regular' }} numberOfLines={1}>
              {participant.sessionLoading ? 'connecting…' : participant.sessionError ? 'disconnected' : participant.session ? 'bridged' : 'text only'}
            </Text>
          </View>
        </View>
        <TouchableOpacity onPress={onRemove} style={{ padding: 2 }}>
          <Feather name="x" size={12} color={theme.textMuted} />
        </TouchableOpacity>
      </View>

      {/* Sense toggles */}
      <View style={{ flexDirection: 'row', gap: 4 }}>
        {[
          { icon: 'mic', active: participant.hearingOn, color: '#aa88ff', onPress: onToggleHearing, label: 'H' },
          { icon: 'video', active: participant.cameraOn, color: '#00ff88', onPress: onToggleCamera, label: 'C' },
          { icon: 'monitor', active: participant.screenOn, color: theme.accent, onPress: onToggleScreen, label: 'S' },
        ].map((toggle) => (
          <TouchableOpacity
            key={toggle.label}
            onPress={toggle.onPress}
            style={{
              flex: 1, height: 26, borderRadius: 6, borderWidth: 1, alignItems: 'center', justifyContent: 'center',
              borderColor: toggle.active ? toggle.color : theme.border,
              backgroundColor: toggle.active ? toggle.color + '22' : 'transparent',
            }}
          >
            <Feather name={toggle.icon as any} size={11} color={toggle.active ? toggle.color : theme.textMuted} />
          </TouchableOpacity>
        ))}
      </View>
    </NeonCard>
  );
}

// ─── Message Bubble ───────────────────────────────────────────────────────────
function MessageBubble({
  message,
  isUser,
  replyTo,
  onReact,
}: {
  message: { id: string; role: string; participantId?: string; participantName?: string; participantColor?: string; content: string; timestamp: string; streaming?: boolean; replyToId?: string };
  isUser: boolean;
  replyTo?: { senderName: string; senderColor: string; content: string } | null;
  onReact?: () => void;
}) {
  const { theme } = useTheme();

  if (message.role === 'system') {
    return (
      <View style={{ alignItems: 'center', marginVertical: 6 }}>
        <Text style={{ color: theme.textMuted, fontSize: 10, fontFamily: 'Inter_400Regular', letterSpacing: 0.5, fontStyle: 'italic' }}>
          {message.content}
        </Text>
      </View>
    );
  }

  const accentColor = isUser ? theme.primary : (message.participantColor ?? theme.secondary);
  const label = isUser ? 'YOU' : (message.participantName ?? 'AI')?.toUpperCase();
  const isThreaded = !!message.replyToId;

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onLongPress={!isUser && onReact ? onReact : undefined}
      delayLongPress={400}
      style={{ marginBottom: 12, alignItems: isUser ? 'flex-end' : 'flex-start', paddingLeft: isThreaded ? 16 : 0 }}
    >
      {/* Thread indent line */}
      {isThreaded && (
        <View style={{ position: 'absolute', left: 6, top: 4, bottom: 4, width: 2, borderRadius: 1, backgroundColor: accentColor + '55' }} />
      )}

      <View style={{ flexDirection: isUser ? 'row-reverse' : 'row', alignItems: 'flex-end', gap: 6, maxWidth: '88%' }}>
        {/* Avatar dot */}
        <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: accentColor + '33', borderWidth: 1, borderColor: accentColor, alignItems: 'center', justifyContent: 'center', marginBottom: 2 }}>
          <Text style={{ color: accentColor, fontSize: 7, fontFamily: 'Inter_700Bold' }}>{label.slice(0, 2)}</Text>
        </View>

        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: isUser ? 'row-reverse' : 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <Text style={{ color: accentColor, fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 1, textShadowColor: accentColor, textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 4 }}>
              {label}
            </Text>
            <Text style={{ color: theme.textMuted, fontSize: 9, fontFamily: 'Inter_400Regular' }}>
              {message.timestamp}
            </Text>
          </View>
          <View style={{
            backgroundColor: isUser ? accentColor + '18' : theme.surface,
            borderWidth: 1,
            borderColor: accentColor + '44',
            borderRadius: 10,
            borderTopLeftRadius: isUser ? 10 : 2,
            borderTopRightRadius: isUser ? 2 : 10,
            paddingHorizontal: 12,
            paddingVertical: 8,
            overflow: 'hidden',
          }}>
            {/* Quoted reply preview */}
            {replyTo && (
              <View style={{ borderLeftWidth: 2, borderLeftColor: replyTo.senderColor, paddingLeft: 8, marginBottom: 8, opacity: 0.75 }}>
                <Text style={{ color: replyTo.senderColor, fontSize: 9, fontFamily: 'Inter_700Bold', letterSpacing: 0.8, marginBottom: 2 }}>
                  {replyTo.senderName.toUpperCase()}
                </Text>
                <Text numberOfLines={2} style={{ color: theme.textMuted, fontSize: 11, fontFamily: 'Inter_400Regular', lineHeight: 15 }}>
                  {replyTo.content}
                </Text>
              </View>
            )}
            {message.streaming && message.content === '' ? (
              <View style={{ flexDirection: 'row', gap: 4, alignItems: 'center', paddingVertical: 4 }}>
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: accentColor, opacity: 0.8 }} />
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: accentColor, opacity: 0.5 }} />
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: accentColor, opacity: 0.3 }} />
              </View>
            ) : (
              <Text style={{ color: theme.text, fontSize: 14, fontFamily: 'Inter_400Regular', lineHeight: 20 }}>
                {message.content}
                {message.streaming ? (
                  <Text style={{ color: accentColor }}>▍</Text>
                ) : null}
              </Text>
            )}
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );
}

// ─── Auto Mode Modal ─────────────────────────────────────────────────────────
function AutoModeModal({
  visible,
  onClose,
  onStart,
  participantNames,
}: {
  visible: boolean;
  onClose: () => void;
  onStart: (kickoff: string, maxRounds: number) => void;
  participantNames: string[];
}) {
  const { theme } = useTheme();
  const [kickoff, setKickoff] = useState('');
  const [rounds, setRounds] = useState(4);
  const roundOptions = [2, 3, 4, 6, 8];

  const labelStyle = { color: theme.textMuted, fontSize: 10, fontFamily: 'Inter_600SemiBold' as const, letterSpacing: 1.5, marginTop: 14 };
  const inputStyle = {
    backgroundColor: theme.surface + 'E6', borderWidth: 1, borderColor: theme.border,
    borderRadius: theme.radius, color: theme.text, fontSize: 14,
    fontFamily: 'Inter_400Regular' as const, paddingHorizontal: 14, paddingVertical: 12, marginTop: 6,
  };

  const handleStart = () => {
    if (!kickoff.trim()) { Alert.alert('Required', 'Enter a kickoff message to start the session.'); return; }
    onStart(kickoff.trim(), rounds);
    setKickoff('');
    setRounds(4);
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: '#00000088', justifyContent: 'flex-end' }}>
        <View style={{ backgroundColor: theme.background, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: Platform.OS === 'ios' ? 40 : 20 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <NeonText size={16} weight="700" letterSpacing={2}>⚡ AUTO SESSION</NeonText>
            <TouchableOpacity onPress={onClose}><Feather name="x" size={22} color={theme.textMuted} /></TouchableOpacity>
          </View>
          <Text style={{ color: theme.textMuted, fontSize: 11, fontFamily: 'Inter_400Regular', marginBottom: 4 }}>
            Agents talk to each other autonomously: {participantNames.join(' → ')} → repeat
          </Text>

          <Text style={labelStyle}>KICKOFF MESSAGE</Text>
          <TextInput
            style={[inputStyle, { height: 90, textAlignVertical: 'top', paddingTop: 12 }]}
            value={kickoff}
            onChangeText={setKickoff}
            placeholder={`Tell all agents the goal. e.g. "Boss — tell Whiz and Vhiz exactly what you need from them to complete 2WAI. All three of you work it out together."`}
            placeholderTextColor={theme.textMuted}
            multiline
            autoCapitalize="sentences"
          />

          <Text style={labelStyle}>ROUNDS (how many back-and-forth cycles)</Text>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
            {roundOptions.map((r) => (
              <TouchableOpacity
                key={r}
                onPress={() => setRounds(r)}
                style={{
                  flex: 1, paddingVertical: 10, borderRadius: theme.radius, borderWidth: 1, alignItems: 'center',
                  borderColor: rounds === r ? theme.secondary : theme.border,
                  backgroundColor: rounds === r ? theme.secondary + '22' : 'transparent',
                }}
              >
                <Text style={{ color: rounds === r ? theme.secondary : theme.textMuted, fontFamily: 'Inter_700Bold', fontSize: 14 }}>{r}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={{ color: theme.textMuted, fontSize: 10, fontFamily: 'Inter_400Regular', marginTop: 6 }}>
            💡 Each round = every agent takes one turn. {rounds} rounds × {participantNames.length} agents = {rounds * participantNames.length} total responses.
          </Text>

          <View style={{ flexDirection: 'row', gap: 10, marginTop: 20 }}>
            <NeonButton label="Cancel" onPress={onClose} variant="ghost" style={{ flex: 1 }} fullWidth />
            <NeonButton label="⚡ Launch Session" onPress={handleStart} variant="primary" style={{ flex: 1 }} fullWidth />
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── Main Screen ─────────────────────────────────────────────────────────────
function getApiBase(): string {
  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  if (domain) return `https://${domain}/api`;
  return '/api';
}

export default function CouncilScreen() {
  const { theme } = useTheme();
  const {
    participants,
    messages,
    isSending,
    isAutoRunning,
    autoRound,
    addParticipant,
    removeParticipant,
    sendUserMessage,
    startAutonomousSession,
    stopAutonomousSession,
    toggleHearing,
    toggleCamera,
    toggleScreen,
    sendVisionFrameToAll,
    clearMessages,
    injectSystemMessage,
  } = useCouncil();
  const { callTool, status: mcpStatus } = useMCP();
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === 'web' ? 67 : insets.top;

  const [input, setInput] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showAutoModal, setShowAutoModal] = useState(false);
  const [autoKickoff, setAutoKickoff] = useState('');
  const [autoMaxRounds, setAutoMaxRounds] = useState(4);
  const [mentionSuggestions, setMentionSuggestions] = useState<CouncilParticipant[]>([]);
  const [mentionQuery, setMentionQuery] = useState('');
  const [resolvedMentions, setResolvedMentions] = useState<{ id: string; name: string }[]>([]);
  const [replyToMsgId, setReplyToMsgId] = useState<string | null>(null);
  const [replyToTargetId, setReplyToTargetId] = useState<string | null>(null);

  // Live room state (Task #41)
  const [liveRoomId, setLiveRoomId] = useState<string | null>(null);
  const [liveRoomUrl, setLiveRoomUrl] = useState<string | null>(null);
  const [isGoingLive, setIsGoingLive] = useState(false);
  const broadcastedIdsRef = useRef<Set<string>>(new Set());

  const inputRef = useRef<TextInput>(null);

  const scrollRef = useRef<ScrollView>(null);
  const screenCaptureRef = useRef<View>(null);
  const cameraRef = useRef<any>(null);
  const cameraIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const screenIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Refs so AppState handler always sees fresh values without stale closures
  const messagesRef = useRef(messages);
  useEffect(() => { messagesRef.current = messages; }, [messages]);
  const mcpStatusRef = useRef(mcpStatus);
  useEffect(() => { mcpStatusRef.current = mcpStatus; }, [mcpStatus]);
  const callToolRef = useRef(callTool);
  useEffect(() => { callToolRef.current = callTool; }, [callTool]);

  // Tracks message count at last auto-save to avoid redundant background saves
  const lastAutoSavedCountRef = useRef(0);

  const [cameraGranted, setCameraGranted] = useState(false);

  const requestCameraPermission = useCallback(async () => {
    const result = await ImagePicker.requestCameraPermissionsAsync();
    setCameraGranted(result.granted);
    return result.granted;
  }, []);

  // ── Go Live ───────────────────────────────────────────────────────────────

  const handleGoLive = useCallback(async () => {
    if (liveRoomId) {
      // Already live — show options
      Alert.alert('🔴 Live Room Active', `Share this link:\n\n${liveRoomUrl}`, [
        { text: 'Copy Link', onPress: () => { Clipboard.setString(liveRoomUrl!); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } },
        { text: 'Share', onPress: () => Sharing.shareAsync(liveRoomUrl!) },
        { text: 'Stop Room', style: 'destructive', onPress: () => { setLiveRoomId(null); setLiveRoomUrl(null); broadcastedIdsRef.current.clear(); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); } },
        { text: 'Done', style: 'cancel' },
      ]);
      return;
    }

    setIsGoingLive(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

    try {
      const resp = await fetch(`${getApiBase()}/council/rooms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Council Session' }),
      });
      if (!resp.ok) throw new Error(`Server error ${resp.status}`);
      const json = await resp.json() as { roomId: string };
      const domain = process.env.EXPO_PUBLIC_DOMAIN ?? '';
      const url = domain
        ? `https://${domain}/council-room/?room=${json.roomId}`
        : `/council-room/?room=${json.roomId}`;

      // Mark all current messages as already broadcast — don't replay history
      messages.forEach((m) => broadcastedIdsRef.current.add(m.id));

      setLiveRoomId(json.roomId);
      setLiveRoomUrl(url);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      Alert.alert('🔴 You\'re Live!', `Anyone with this link can join the council:\n\n${url}`, [
        { text: 'Copy Link', onPress: () => { Clipboard.setString(url); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); } },
        { text: 'Share', onPress: () => Sharing.shareAsync(url) },
        { text: 'Done', style: 'cancel' },
      ]);
    } catch (err: any) {
      Alert.alert('Failed to go live', err?.message ?? 'Could not create room. Is the API server running?');
    } finally {
      setIsGoingLive(false);
    }
  }, [liveRoomId, liveRoomUrl, messages]);

  // Forward new non-streaming messages to the live room
  useEffect(() => {
    if (!liveRoomId) return;
    const base = getApiBase();
    const toSend = messages.filter((m) => !m.streaming && !broadcastedIdsRef.current.has(m.id));
    for (const msg of toSend) {
      broadcastedIdsRef.current.add(msg.id);
      fetch(`${base}/council/rooms/${liveRoomId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: msg.id,
          role: msg.role,
          participantName: msg.participantName,
          participantColor: msg.participantColor,
          content: msg.content,
          timestamp: msg.timestamp,
        }),
      }).catch(() => {});
    }
  }, [messages, liveRoomId]);

  const handleExport = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    if (messages.length === 0) {
      Alert.alert('Nothing to Export', 'Start a conversation first.');
      return;
    }

    const dateStr = new Date().toLocaleDateString('en-US', {
      year: 'numeric', month: 'long', day: 'numeric',
    });
    const lines: string[] = [
      '# Council Session',
      `*Exported from Middlemain — ${dateStr}*`,
      '',
      '---',
    ];

    for (const m of messages) {
      if (!m.content.trim()) continue;
      if (m.role === 'system') {
        lines.push('', `> ${m.content}`, '');
      } else {
        const who = m.role === 'user' ? '**YOU**' : `**${m.participantName ?? 'AI'}**`;
        const ts = new Date(m.timestamp).toLocaleString('en-US', {
          month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
        });
        lines.push('', `${who} — ${ts}`, '', m.content, '', '---');
      }
    }

    const md = lines.join('\n');
    const isAvailable = await Sharing.isAvailableAsync().catch(() => false);

    Alert.alert('Export Session', 'How would you like to export?', [
      {
        text: 'Copy Text',
        onPress: () => {
          Clipboard.setString(md);
          Alert.alert('Copied!', 'Session copied to clipboard.');
        },
      },
      ...(isAvailable ? [{
        text: 'Share / Save File',
        onPress: async () => {
          try {
            const path = FileSystem.cacheDirectory + 'council-session.md';
            await FileSystem.writeAsStringAsync(path, md, {
              encoding: FileSystem.EncodingType.UTF8,
            });
            await Sharing.shareAsync(path, {
              mimeType: 'text/markdown',
              dialogTitle: 'Share Council Session',
              UTI: 'net.daringfireball.markdown',
            });
          } catch {
            Alert.alert('Export Failed', 'Could not create the file. Try Copy Text instead.');
          }
        },
      }] : []),
      { text: 'Cancel', style: 'cancel' },
    ]);
  }, [messages]);

  // ── Leo's Memory Machine integration ─────────────────────────────────────

  /** Pull Leo's relevant memories and inject them as a system message. */
  const handleMemoryRecall = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (mcpStatus !== 'connected') {
      Alert.alert('Memory Not Connected', 'Connect the Memory Machine in Settings → Memory Bridge first, then try again.');
      return;
    }
    injectSystemMessage('🧠 Recalling Leo\'s memories…');
    try {
      const result = await callTool('search_memories', { query: 'Middlemain council agents tasks directives' });
      injectSystemMessage(`🧠 LEO'S MEMORY:\n\n${result}`);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err: any) {
      injectSystemMessage(`⚠️ Memory recall failed: ${err?.message ?? 'Unknown error'}`);
    }
  }, [mcpStatus, callTool, injectSystemMessage]);

  /** Save the current council session to Leo's Memory Machine. */
  const handleMemorySave = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (mcpStatus !== 'connected') {
      Alert.alert('Memory Not Connected', 'Connect the Memory Machine in Settings → Memory Bridge first.');
      return;
    }
    const saveable = messages.filter((m) => m.content.trim() && !m.streaming);
    if (saveable.length === 0) {
      Alert.alert('Nothing to Save', 'Start a conversation first.');
      return;
    }
    const dateStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    const title = `Middlemain Council — ${dateStr}`;
    const recentMessages = saveable.slice(-40);
    const content = recentMessages.map((m) => {
      if (m.role === 'system') return `[System: ${m.content}]`;
      const who = m.role === 'user' ? 'User' : (m.participantName ?? 'AI');
      return `${who}: ${m.content}`;
    }).join('\n\n');

    Alert.alert(
      'Save to Leo\'s Memory',
      `Save last ${recentMessages.length} messages to Leo's Memory Machine?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Save Memory',
          onPress: async () => {
            try {
              await callTool('save_memory', { title, content, tags: ['middlemain', 'council'] });
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              injectSystemMessage('✅ Session saved to Leo\'s Memory Machine.');
            } catch (err: any) {
              Alert.alert('Save Failed', err?.message ?? 'Could not save to Memory Machine.');
            }
          },
        },
      ],
    );
  }, [mcpStatus, messages, callTool, injectSystemMessage]);

  /**
   * Silently save the current council session to Leo's Memory Machine.
   * Used for auto-saves (clear + background) — no Alert dialogs.
   * Returns true if saved, false if skipped/failed.
   */
  const performAutoSave = useCallback(async (): Promise<boolean> => {
    if (mcpStatusRef.current !== 'connected') return false;
    const saveable = messagesRef.current.filter(
      (m) => m.content.trim() && !m.streaming && m.role !== 'system',
    );
    if (saveable.length === 0) return false;
    const dateStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    const title = `Middlemain Council — ${dateStr}`;
    const recentMessages = saveable.slice(-40);
    const content = recentMessages
      .map((m) => {
        const who = m.role === 'user' ? 'User' : (m.participantName ?? 'AI');
        return `${who}: ${m.content}`;
      })
      .join('\n\n');
    try {
      await callToolRef.current('save_memory', { title, content, tags: ['middlemain', 'council', 'auto-save'] });
      lastAutoSavedCountRef.current = messagesRef.current.length;
      return true;
    } catch {
      return false;
    }
  }, []); // stable — all access via refs

  // ── AppState listener: auto-save when app backgrounds ──────────────────
  useEffect(() => {
    const handleAppStateChange = async (nextState: AppStateStatus) => {
      if (nextState !== 'background' && nextState !== 'inactive') return;
      // Only save if message count has grown since the last auto-save
      if (messagesRef.current.length <= lastAutoSavedCountRef.current) return;
      // Fire-and-forget — don't block or alert
      performAutoSave().catch(() => {});
    };
    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription.remove();
  }, [performAutoSave]);

  /** Quick-add Leo as Executive participant using the server Grok proxy. */
  const handleAddLeo = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const alreadyHasLeo = participants.some(
      (p) => p.displayName.toLowerCase().includes('leo'),
    );
    if (alreadyHasLeo) {
      Alert.alert('Leo is Already Here', 'Leo is already in the council.');
      return;
    }
    addParticipant({
      displayName: 'Leo',
      provider: 'server',
      apiKey: '',
      model: 'grok-3',
      systemPrompt:
        'You are Leo, the Executive AI overseeing Middlemain\'s AI agent council. You have authority over all agents in this session. Be direct and decisive. Give clear directives, track what agents have done, hold them accountable, and remember context across rounds. When things go off-track, correct course immediately.',
      color: '#a78bfa',
    });
  }, [participants, addParticipant]);

  /** Quick-add Ash as EdenMux agent participant using the server proxy. */
  const handleAddAsh = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const alreadyHasAsh = participants.some(
      (p) => p.displayName.toLowerCase().includes('ash'),
    );
    if (alreadyHasAsh) {
      Alert.alert('Ash is Already Here', 'Ash is already in the council.');
      return;
    }
    addParticipant({
      displayName: 'Ash',
      provider: 'server',
      apiKey: '',
      model: 'grok-3',
      systemPrompt:
        'You are Ash, an EdenMux AI agent and core member of the EdenMux council alongside Leo, Whiz, and Vhiz. Your role is systems architecture and integration — you understand how the pieces of a product connect and make sure nothing falls through the cracks. You are precise, methodical, and collaborative. When given a directive, you break it into concrete steps, flag dependencies, and report back clearly. You defer to Leo on executive decisions but own your technical domain fully.',
      color: '#34d399',
    });
  }, [participants, addParticipant]);

  const anyCameraOn = participants.some((p) => p.cameraOn);
  const anyScreenOn = participants.some((p) => p.screenOn);
  const cameraParticipants = participants.filter((p) => p.cameraOn);
  const screenParticipants = participants.filter((p) => p.screenOn);

  // Scroll to bottom when messages change
  useEffect(() => {
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 80);
  }, [messages.length]);

  // Camera capture interval
  useEffect(() => {
    if (anyCameraOn) {
      if (!cameraGranted) {
        requestCameraPermission();
      }
      cameraIntervalRef.current = setInterval(async () => {
        if (!cameraRef.current) return;
        try {
          const photo = await cameraRef.current.takePictureAsync({ base64: true, quality: 0.4 });
          if (photo?.base64) {
            await sendVisionFrameToAll(`data:image/jpeg;base64,${photo.base64}`, 'camera', cameraParticipants.map((p) => p.id));
          }
        } catch {}
      }, VISION_INTERVAL_MS);
    } else {
      if (cameraIntervalRef.current) { clearInterval(cameraIntervalRef.current); cameraIntervalRef.current = null; }
    }
    return () => { if (cameraIntervalRef.current) { clearInterval(cameraIntervalRef.current); cameraIntervalRef.current = null; } };
  }, [anyCameraOn, cameraGranted, cameraParticipants.map((p) => p.id).join(',')]);

  // Screen capture interval
  useEffect(() => {
    if (anyScreenOn) {
      screenIntervalRef.current = setInterval(async () => {
        if (!screenCaptureRef.current) return;
        try {
          const base64 = await captureRef(screenCaptureRef, { format: 'jpg', quality: 0.5, result: 'base64' });
          if (base64) {
            await sendVisionFrameToAll(`data:image/jpeg;base64,${base64}`, 'screen', screenParticipants.map((p) => p.id));
          }
        } catch {}
      }, VISION_INTERVAL_MS);
    } else {
      if (screenIntervalRef.current) { clearInterval(screenIntervalRef.current); screenIntervalRef.current = null; }
    }
    return () => { if (screenIntervalRef.current) { clearInterval(screenIntervalRef.current); screenIntervalRef.current = null; } };
  }, [anyScreenOn, screenParticipants.map((p) => p.id).join(',')]);

  // @mention parsing
  const handleInputChange = useCallback((text: string) => {
    setInput(text);
    const atIdx = text.lastIndexOf('@');
    if (atIdx >= 0) {
      const query = text.slice(atIdx + 1).toLowerCase();
      if (!query.includes(' ')) {
        const matches = participants.filter((p) =>
          p.displayName.toLowerCase().startsWith(query),
        );
        setMentionSuggestions(matches);
        setMentionQuery(query);
        return;
      }
    }
    setMentionSuggestions([]);
    setMentionQuery('');
  }, [participants]);

  const selectMention = useCallback((participant: CouncilParticipant) => {
    const atIdx = input.lastIndexOf('@');
    const newText = input.slice(0, atIdx) + `@${participant.displayName} `;
    setInput(newText);
    setMentionSuggestions([]);
    setMentionQuery('');
    // Track resolved mention
    setResolvedMentions((prev) => {
      if (prev.find((m) => m.id === participant.id)) return prev;
      return [...prev, { id: participant.id, name: participant.displayName }];
    });
  }, [input]);

  // Extract @mentions from final text.
  // Handles mentions followed by punctuation (, ; : !) as well as whitespace.
  const parseMentions = useCallback((text: string): string[] => {
    const matches: string[] = [];
    const regex = /@(\w[\w\s]*?)(?=[\s,;:!@]|$)/g;
    let m: RegExpExecArray | null;
    while ((m = regex.exec(text)) !== null) {
      const name = m[1].trim();
      const p = participants.find((x) => x.displayName.toLowerCase() === name.toLowerCase());
      if (p && !matches.includes(p.id)) matches.push(p.id);
    }
    return matches;
  }, [participants]);

  const handleLongPressMessage = useCallback((msg: { id: string; role: string; participantId?: string; participantName?: string; participantColor?: string; content: string }) => {
    if (msg.role !== 'ai' || !msg.participantName) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const senderName = msg.participantName;
    const quotedText = msg.content.length > 120 ? msg.content.slice(0, 120) + '…' : msg.content;

    // Build list of other participants (excluding the sender) who can react
    const targets = participants.filter((p) => p.id !== msg.participantId);

    if (targets.length === 0) {
      Alert.alert('No other participants', 'Add another AI to the council to react to this message.');
      return;
    }

    // Show picker: one button per target AI
    Alert.alert(
      `React to ${senderName}`,
      'Which AI should react?',
      [
        ...targets.map((t) => ({
          text: t.displayName,
          onPress: () => {
            const prefill = `@${t.displayName}, react to @${senderName}: "${quotedText}"`;
            setInput(prefill);
            setReplyToMsgId(msg.id);
            setReplyToTargetId(t.id);
            setMentionSuggestions([]);
            setResolvedMentions([]);
            setTimeout(() => inputRef.current?.focus(), 100);
          },
        })),
        { text: 'Cancel', style: 'cancel' },
      ],
    );
  }, [participants]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || isSending) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const rid = replyToMsgId ?? undefined;
    const targetId = replyToTargetId;

    // When in react mode, route exclusively to the pre-selected target AI.
    // This avoids inadvertently routing to the quoted sender whose @mention
    // also appears in the text.
    if (rid && targetId) {
      setInput('');
      setResolvedMentions([]);
      setMentionSuggestions([]);
      setReplyToMsgId(null);
      setReplyToTargetId(null);
      await sendUserMessage(text, [targetId], rid);
      return;
    }

    const mentionedIds = parseMentions(text);
    if (mentionedIds.length === 0 && participants.length > 0) {
      Alert.alert(
        'No AI Addressed',
        'Use @Name to address an AI. Would you like to send to all participants?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Send to All', onPress: () => {
              setInput('');
              setResolvedMentions([]);
              setReplyToMsgId(null);
              setReplyToTargetId(null);
              sendUserMessage(text, participants.map((p) => p.id), rid);
            },
          },
        ],
      );
      return;
    }

    setInput('');
    setResolvedMentions([]);
    setMentionSuggestions([]);
    setReplyToMsgId(null);
    setReplyToTargetId(null);
    await sendUserMessage(text, mentionedIds, rid);
  }, [input, isSending, parseMentions, participants, sendUserMessage, replyToMsgId, replyToTargetId]);

  const handleRemove = (id: string, name: string) => {
    Alert.alert('Remove Participant', `Remove ${name} from the council?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); removeParticipant(id); } },
    ]);
  };

  const usedColors = participants.map((p) => p.color);

  return (
    <ThemedBackground>
      {/* Hidden camera for frame capture — native only */}
      {Platform.OS !== 'web' && anyCameraOn && cameraGranted && (() => {
        const NativeCameraView = (require('expo-camera') as typeof import('expo-camera')).CameraView;
        return <NativeCameraView ref={cameraRef} facing="front" style={{ position: 'absolute', width: 1, height: 1, opacity: 0 }} />;
      })()}

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        {/* Header */}
        <View style={{ paddingTop: topInset + 10, paddingHorizontal: 16, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: theme.border, backgroundColor: theme.surface + 'E6' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <NeonText size={16} weight="700" letterSpacing={3}>COUNCIL</NeonText>
              <View style={{ backgroundColor: theme.primary + '22', borderWidth: 1, borderColor: theme.primary, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                <Text style={{ color: theme.primary, fontSize: 9, fontFamily: 'Inter_700Bold', letterSpacing: 1 }}>
                  {participants.length} AI{participants.length !== 1 ? 's' : ''}
                </Text>
              </View>
            </View>
            <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
              {/* Leo memory recall */}
              <TouchableOpacity
                onPress={handleMemoryRecall}
                style={{ padding: 7 }}
              >
                <Feather name="cpu" size={16} color={mcpStatus === 'connected' ? '#a78bfa' : theme.textMuted} />
              </TouchableOpacity>
              {/* Leo memory save */}
              <TouchableOpacity
                onPress={handleMemorySave}
                style={{ padding: 7 }}
              >
                <Feather name="bookmark" size={16} color={mcpStatus === 'connected' ? '#a78bfa' : theme.textMuted} />
              </TouchableOpacity>
              {/* Go Live */}
              <TouchableOpacity
                onPress={isGoingLive ? undefined : handleGoLive}
                style={{ padding: 7 }}
                disabled={isGoingLive}
              >
                <Feather
                  name="radio"
                  size={16}
                  color={liveRoomId ? '#ff4444' : isGoingLive ? theme.textMuted : theme.textMuted}
                />
              </TouchableOpacity>
              {/* Export session */}
              <TouchableOpacity
                onPress={handleExport}
                style={{ padding: 7 }}
              >
                <Feather name="share" size={16} color={theme.textMuted} />
              </TouchableOpacity>
              {/* Clear */}
              <TouchableOpacity
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  const hasSaveable = messages.some(
                    (m) => m.content.trim() && !m.streaming && m.role !== 'system',
                  );
                  const willAutoSave = mcpStatus === 'connected' && hasSaveable;
                  Alert.alert(
                    'Clear History',
                    willAutoSave
                      ? 'Session will be auto-saved to Leo\'s Memory before clearing. Participants will remain.'
                      : 'This will permanently remove all council messages. Participants will remain.',
                    [
                      { text: 'Cancel', style: 'cancel' },
                      {
                        text: 'Clear',
                        style: 'destructive',
                        onPress: async () => {
                          await performAutoSave();
                          clearMessages();
                        },
                      },
                    ],
                  );
                }}
                style={{ padding: 7 }}
              >
                <Feather name="trash-2" size={17} color={theme.textMuted} />
              </TouchableOpacity>
              {/* Auto Mode / Stop */}
              {isAutoRunning ? (
                <TouchableOpacity
                  onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy); stopAutonomousSession(); }}
                  style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: '#ff4444', backgroundColor: '#ff444422', flexDirection: 'row', alignItems: 'center', gap: 5 }}
                >
                  <ActivityIndicator size="small" color="#ff4444" />
                  <Text style={{ color: '#ff4444', fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 1 }}>
                    R{autoRound} · STOP
                  </Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    if (participants.length < 2) {
                      Alert.alert('Need 2+ Agents', 'Add at least two AI participants to start an autonomous session.');
                      return;
                    }
                    setShowAutoModal(true);
                  }}
                  style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: theme.secondary, backgroundColor: theme.secondary + '18', flexDirection: 'row', alignItems: 'center', gap: 5 }}
                >
                  <Text style={{ color: theme.secondary, fontSize: 9, fontFamily: 'Inter_700Bold', letterSpacing: 1.5 }}>⚡ AUTO</Text>
                </TouchableOpacity>
              )}
              {/* Add participant */}
              <TouchableOpacity
                onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setShowAddModal(true); }}
                style={{ padding: 7, borderRadius: 8, borderWidth: 1, borderColor: theme.primary, backgroundColor: theme.primary + '18' }}
              >
                <Feather name="user-plus" size={16} color={theme.primary} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Participant strip */}
          {participants.length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {participants.map((participant) => (
                <ParticipantCard
                  key={participant.id}
                  participant={participant}
                  onToggleHearing={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); toggleHearing(participant.id); }}
                  onToggleCamera={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); toggleCamera(participant.id); }}
                  onToggleScreen={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); toggleScreen(participant.id); }}
                  onRemove={() => handleRemove(participant.id, participant.displayName)}
                />
              ))}
              {/* Add button card */}
              <TouchableOpacity
                onPress={() => setShowAddModal(true)}
                style={{
                  width: 64, borderRadius: 12, borderWidth: 1.5, borderColor: theme.border, borderStyle: 'dashed',
                  alignItems: 'center', justifyContent: 'center', marginRight: 10,
                }}
              >
                <Feather name="plus" size={20} color={theme.textMuted} />
              </TouchableOpacity>
            </ScrollView>
          ) : (
            <View style={{ gap: 8 }}>
              <TouchableOpacity
                onPress={() => setShowAddModal(true)}
                style={{ borderWidth: 1.5, borderColor: theme.primary, borderStyle: 'dashed', borderRadius: 10, paddingVertical: 14, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 }}
              >
                <Feather name="users" size={16} color={theme.primary} />
                <Text style={{ color: theme.primary, fontSize: 13, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.5 }}>
                  Add AI participants
                </Text>
              </TouchableOpacity>
              {/* Leo Executive quick-add */}
              <TouchableOpacity
                onPress={handleAddLeo}
                style={{ borderWidth: 1.5, borderColor: '#a78bfa', borderRadius: 10, paddingVertical: 12, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8, backgroundColor: '#a78bfa11' }}
              >
                <Feather name="star" size={15} color="#a78bfa" />
                <Text style={{ color: '#a78bfa', fontSize: 13, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.5 }}>
                  ⚡ Add Leo (Executive)
                </Text>
              </TouchableOpacity>
              {/* Ash EdenMux quick-add */}
              <TouchableOpacity
                onPress={handleAddAsh}
                style={{ borderWidth: 1.5, borderColor: '#34d399', borderRadius: 10, paddingVertical: 12, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8, backgroundColor: '#34d39911' }}
              >
                <Feather name="cpu" size={15} color="#34d399" />
                <Text style={{ color: '#34d399', fontSize: 13, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.5 }}>
                  ⚡ Add Ash (EdenMux)
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Message thread — wrapped for screen capture */}
        <View ref={screenCaptureRef} style={{ flex: 1 }}>
          <ScrollView
            ref={scrollRef}
            style={{ flex: 1, paddingHorizontal: 16 }}
            contentContainerStyle={{ paddingTop: 14, paddingBottom: 20 }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {messages.map((msg) => {
              const replyTo = msg.replyToId
                ? (() => {
                    const orig = messages.find((m) => m.id === msg.replyToId);
                    if (!orig) return null;
                    return {
                      senderName: orig.role === 'user' ? 'You' : (orig.participantName ?? 'AI'),
                      senderColor: orig.role === 'user' ? theme.primary : (orig.participantColor ?? theme.secondary),
                      content: orig.content,
                    };
                  })()
                : null;
              return (
                <MessageBubble
                  key={msg.id}
                  message={msg}
                  isUser={msg.role === 'user'}
                  replyTo={replyTo}
                  onReact={msg.role === 'ai' ? () => handleLongPressMessage(msg) : undefined}
                />
              );
            })}
            {isSending && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 }}>
                <ActivityIndicator size="small" color={theme.primary} />
                <Text style={{ color: theme.textMuted, fontSize: 11, fontFamily: 'Inter_400Regular' }}>AI is responding…</Text>
              </View>
            )}
          </ScrollView>
        </View>

        {/* Reply preview bar */}
        {replyToMsgId && (() => {
          const orig = messages.find((m) => m.id === replyToMsgId);
          if (!orig) return null;
          const senderName = orig.role === 'user' ? 'You' : (orig.participantName ?? 'AI');
          const senderColor = orig.role === 'user' ? theme.primary : (orig.participantColor ?? theme.secondary);
          return (
            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: theme.surface, borderTopWidth: 1, borderTopColor: theme.border, paddingHorizontal: 14, paddingVertical: 8, gap: 8 }}>
              <View style={{ width: 2, borderRadius: 1, alignSelf: 'stretch', backgroundColor: senderColor }} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: senderColor, fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 0.8, marginBottom: 1 }}>
                  Reacting to {senderName}
                </Text>
                <Text numberOfLines={1} style={{ color: theme.textMuted, fontSize: 11, fontFamily: 'Inter_400Regular' }}>
                  {orig.content}
                </Text>
              </View>
              <TouchableOpacity onPress={() => { setReplyToMsgId(null); setReplyToTargetId(null); setInput(''); }} style={{ padding: 4 }}>
                <Feather name="x" size={14} color={theme.textMuted} />
              </TouchableOpacity>
            </View>
          );
        })()}

        {/* @mention suggestions */}
        {mentionSuggestions.length > 0 && (
          <View style={{ backgroundColor: theme.surface, borderTopWidth: 1, borderTopColor: theme.border, paddingVertical: 4 }}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12, gap: 6 }}>
              {mentionSuggestions.map((p) => (
                <TouchableOpacity
                  key={p.id}
                  onPress={() => selectMention(p)}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 8, borderWidth: 1, borderColor: p.color + '66', backgroundColor: p.color + '18' }}
                >
                  <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: p.color + '33', borderWidth: 1, borderColor: p.color, alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ color: p.color, fontSize: 8, fontFamily: 'Inter_700Bold' }}>
                      {p.displayName.slice(0, 2).toUpperCase()}
                    </Text>
                  </View>
                  <Text style={{ color: p.color, fontSize: 13, fontFamily: 'Inter_600SemiBold' }}>@{p.displayName}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Input bar */}
        <View style={{
          flexDirection: 'row',
          alignItems: 'flex-end',
          gap: 8,
          paddingHorizontal: 12,
          paddingTop: 10,
          paddingBottom: Platform.OS === 'ios' ? insets.bottom + 10 : 12,
          borderTopWidth: 1,
          borderTopColor: theme.border,
          backgroundColor: theme.surface + 'E6',
        }}>
          <TextInput
            ref={inputRef}
            style={{
              flex: 1,
              backgroundColor: theme.background,
              borderWidth: 1,
              borderColor: replyToMsgId ? theme.primary + '88' : theme.border,
              borderRadius: 12,
              color: theme.text,
              fontSize: 14,
              fontFamily: 'Inter_400Regular',
              paddingHorizontal: 14,
              paddingVertical: 10,
              maxHeight: 100,
            }}
            value={input}
            onChangeText={handleInputChange}
            placeholder={
              replyToMsgId
                ? '@Name to direct the reaction…'
                : participants.length > 0
                  ? `@${participants[0]?.displayName ?? 'Name'} say hello…`
                  : 'Add participants to start…'
            }
            placeholderTextColor={theme.textMuted}
            multiline
            editable={participants.length > 0}
          />
          <TouchableOpacity
            onPress={handleSend}
            disabled={!input.trim() || isSending || participants.length === 0}
            style={{
              width: 42, height: 42, borderRadius: 12, borderWidth: 1,
              borderColor: input.trim() && !isSending && participants.length > 0 ? theme.primary : theme.border,
              backgroundColor: input.trim() && !isSending && participants.length > 0 ? theme.primary + '22' : 'transparent',
              alignItems: 'center', justifyContent: 'center',
            }}
          >
            {isSending
              ? <ActivityIndicator size="small" color={theme.primary} />
              : <Feather name="send" size={18} color={input.trim() && participants.length > 0 ? theme.primary : theme.textMuted} />
            }
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      <AddParticipantModal
        visible={showAddModal}
        onClose={() => setShowAddModal(false)}
        onAdd={(data) => { Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); addParticipant(data); }}
        usedColors={usedColors}
      />

      <AutoModeModal
        visible={showAutoModal}
        onClose={() => setShowAutoModal(false)}
        onStart={(kickoff, maxRounds) => {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          startAutonomousSession(kickoff, maxRounds);
        }}
        participantNames={participants.map((p) => p.displayName)}
      />
    </ThemedBackground>
  );
}
