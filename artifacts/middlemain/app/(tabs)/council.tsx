import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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

const VISION_INTERVAL_MS = 3000;

const PROVIDERS: { key: AIProvider; label: string }[] = [
  { key: 'xai', label: 'Grok (xAI)' },
  { key: 'openai', label: 'OpenAI' },
  { key: 'anthropic', label: 'Anthropic' },
  { key: 'server', label: 'Dev Server' },
  { key: 'custom', label: 'Custom' },
];

// ─── Add Participant Modal ────────────────────────────────────────────────────
function AddParticipantModal({
  visible,
  onClose,
  onAdd,
  usedColors,
}: {
  visible: boolean;
  onClose: () => void;
  onAdd: (data: Omit<CouncilParticipant, 'id' | 'session' | 'sessionLoading' | 'hearingOn' | 'cameraOn' | 'screenOn' | 'isAutoLoaded'>) => void;
  usedColors: string[];
}) {
  const { theme } = useTheme();
  const [provider, setProvider] = useState<AIProvider>('xai');
  const [name, setName] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState(PROVIDER_DEFAULTS['xai'].model);
  const [baseUrl, setBaseUrl] = useState('');

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
    if (!name) setName(PROVIDER_DEFAULTS[p]?.label ?? p);
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
      systemPrompt: 'You are a helpful AI assistant participating in a multi-AI council chat.',
      color,
    });
    setName(''); setApiKey(''); setModel(PROVIDER_DEFAULTS['xai'].model); setBaseUrl(''); setProvider('xai');
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: '#00000088', justifyContent: 'flex-end' }}>
        <View style={{ backgroundColor: theme.background, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: Platform.OS === 'ios' ? 40 : 20, maxHeight: '85%' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <NeonText size={16} weight="700" letterSpacing={2}>ADD PARTICIPANT</NeonText>
            <TouchableOpacity onPress={onClose}><Feather name="x" size={22} color={theme.textMuted} /></TouchableOpacity>
          </View>
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
            <TextInput style={inputStyle} value={name} onChangeText={setName} placeholder="Claude, GPT-4, etc." placeholderTextColor={theme.textMuted} />

            <Text style={labelStyle}>API KEY</Text>
            <TextInput style={inputStyle} value={apiKey} onChangeText={setApiKey} placeholder="sk-..." placeholderTextColor={theme.textMuted} secureTextEntry autoCapitalize="none" autoCorrect={false} />

            <Text style={labelStyle}>MODEL</Text>
            <TextInput style={inputStyle} value={model} onChangeText={setModel} placeholder="grok-3" placeholderTextColor={theme.textMuted} autoCapitalize="none" autoCorrect={false} />

            {provider === 'custom' && (
              <>
                <Text style={labelStyle}>BASE URL</Text>
                <TextInput style={inputStyle} value={baseUrl} onChangeText={setBaseUrl} placeholder="https://api.example.com/v1" placeholderTextColor={theme.textMuted} autoCapitalize="none" autoCorrect={false} keyboardType="url" />
              </>
            )}

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
            <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: participant.session ? participant.color : theme.textMuted }} />
            <Text style={{ color: theme.textMuted, fontSize: 8, fontFamily: 'Inter_400Regular' }}>
              {participant.sessionLoading ? 'connecting…' : participant.session ? 'bridged' : 'text only'}
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
function MessageBubble({ message, isUser }: { message: { id: string; role: string; participantId?: string; participantName?: string; participantColor?: string; content: string; timestamp: string; streaming?: boolean }; isUser: boolean }) {
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

  return (
    <View style={{ marginBottom: 12, alignItems: isUser ? 'flex-end' : 'flex-start' }}>
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
          }}>
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
    </View>
  );
}

// ─── Main Screen ─────────────────────────────────────────────────────────────
export default function CouncilScreen() {
  const { theme } = useTheme();
  const {
    participants,
    messages,
    isSending,
    addParticipant,
    removeParticipant,
    sendUserMessage,
    toggleHearing,
    toggleCamera,
    toggleScreen,
    sendVisionFrameToAll,
    clearMessages,
  } = useCouncil();
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === 'web' ? 67 : insets.top;

  const [input, setInput] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [mentionSuggestions, setMentionSuggestions] = useState<CouncilParticipant[]>([]);
  const [mentionQuery, setMentionQuery] = useState('');
  const [resolvedMentions, setResolvedMentions] = useState<{ id: string; name: string }[]>([]);

  const scrollRef = useRef<ScrollView>(null);
  const screenCaptureRef = useRef<View>(null);
  const cameraRef = useRef<any>(null);
  const cameraIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const screenIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [cameraGranted, setCameraGranted] = useState(false);

  const requestCameraPermission = useCallback(async () => {
    const result = await ImagePicker.requestCameraPermissionsAsync();
    setCameraGranted(result.granted);
    return result.granted;
  }, []);

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

  // Extract @mentions from final text
  const parseMentions = useCallback((text: string): string[] => {
    const matches: string[] = [];
    const regex = /@(\w[\w\s]*?)(?=\s|@|$)/g;
    let m: RegExpExecArray | null;
    while ((m = regex.exec(text)) !== null) {
      const name = m[1].trim();
      const p = participants.find((x) => x.displayName.toLowerCase() === name.toLowerCase());
      if (p && !matches.includes(p.id)) matches.push(p.id);
    }
    return matches;
  }, [participants]);

  const handleSend = useCallback(async () => {
    const text = input.trim();
    if (!text || isSending) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

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
              sendUserMessage(text, participants.map((p) => p.id));
            },
          },
        ],
      );
      return;
    }

    setInput('');
    setResolvedMentions([]);
    setMentionSuggestions([]);
    await sendUserMessage(text, mentionedIds);
  }, [input, isSending, parseMentions, participants, sendUserMessage]);

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
            <View style={{ flexDirection: 'row', gap: 6 }}>
              <TouchableOpacity onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); clearMessages(); }} style={{ padding: 7 }}>
                <Feather name="trash-2" size={17} color={theme.textMuted} />
              </TouchableOpacity>
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
            <TouchableOpacity
              onPress={() => setShowAddModal(true)}
              style={{ borderWidth: 1.5, borderColor: theme.primary, borderStyle: 'dashed', borderRadius: 10, paddingVertical: 14, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8 }}
            >
              <Feather name="users" size={16} color={theme.primary} />
              <Text style={{ color: theme.primary, fontSize: 13, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.5 }}>
                Add AI participants
              </Text>
            </TouchableOpacity>
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
            {messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} isUser={msg.role === 'user'} />
            ))}
            {isSending && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 }}>
                <ActivityIndicator size="small" color={theme.primary} />
                <Text style={{ color: theme.textMuted, fontSize: 11, fontFamily: 'Inter_400Regular' }}>AI is responding…</Text>
              </View>
            )}
          </ScrollView>
        </View>

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
            style={{
              flex: 1,
              backgroundColor: theme.background,
              borderWidth: 1,
              borderColor: theme.border,
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
            placeholder={participants.length > 0 ? `@${participants[0]?.displayName ?? 'Name'} say hello…` : 'Add participants to start…'}
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
    </ThemedBackground>
  );
}
