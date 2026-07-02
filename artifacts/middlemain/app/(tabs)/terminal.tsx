import { Feather } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { captureRef } from 'react-native-view-shot';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AdBanner } from '@/components/AdBanner';
import { AICursorOverlay, CursorAction, parseCursorAction, stripCursorBlock } from '@/components/AICursorOverlay';
import { NetworkStatusBar } from '@/components/NetworkStatusBar';
import { NeonText } from '@/components/NeonText';
import { ThemedBackground } from '@/components/ThemedBackground';
import { ChatMessage, useAI } from '@/context/AIContext';
import { useAisAndEars } from '@/context/AisAndEarsContext';
import { useSkills } from '@/context/SkillsContext';
import { useTheme } from '@/context/ThemeContext';

interface TerminalLine {
  id: string;
  type: 'input' | 'output' | 'system' | 'error' | 'image' | 'vision' | 'transcript';
  content: string;
  timestamp: string;
  imageUri?: string;
  source?: 'camera' | 'screen';
}

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

const VISION_INTERVAL_MS = 3000;
const CONTROL_INTERVAL_MS = 1500;

const CURSOR_CONTROL_SYSTEM_PROMPT = `You are Leo, an AI with live cursor control over the Middlemain screen. When you receive screen share frames:
1. Briefly describe what you see and offer help or observations
2. Optionally move your cursor to something interesting by including EXACTLY this block at the end of your response:
\`\`\`cursor
{"x": 0.5, "y": 0.4, "tap": false, "label": "here"}
\`\`\`
Where x (0=left, 1=right) and y (0=top, 1=bottom) are relative positions. Set "tap": true to show a tap ripple. Keep your response concise — it appears in a terminal.`;

export default function TerminalScreen() {
  const { theme } = useTheme();
  const { connections, activeConnection, sendMessage } = useAI();
  const { skills } = useSkills();
  const {
    status: bridgeStatus,
    hearingOn, cameraOn, screenOn,
    toggleHearing, toggleCamera, toggleScreen,
    sendVisionFrame, subscribe,
    session,
  } = useAisAndEars();
  const insets = useSafeAreaInsets();
  const [cameraGranted, setCameraGranted] = useState(false);

  const [input, setInput] = useState('');
  const [lines, setLines] = useState<TerminalLine[]>([
    {
      id: genId(), type: 'system',
      content: '>>> MIDDLEMAIN BRIDGE TERMINAL v0.1\n>>> Vision · Skills · Real-time AI streaming\n>>> Select a skill and AI, then execute.',
      timestamp: new Date().toLocaleTimeString(),
    },
  ]);
  const [selectedSkillId, setSelectedSkillId] = useState('chat');
  const [selectedConnId, setSelectedConnId] = useState(activeConnection?.id ?? '');
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingLine, setStreamingLine] = useState('');
  const [attachedImage, setAttachedImage] = useState<{ uri: string; base64: string } | null>(null);
  const [controlOn, setControlOn] = useState(false);
  const [cursorAction, setCursorAction] = useState<CursorAction | null>(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });

  const scrollRef = useRef<ScrollView>(null);
  const cameraRef = useRef<any>(null);
  const screenCaptureRef = useRef<View>(null);
  const cameraIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const screenIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const controlIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const topInset = Platform.OS === 'web' ? 67 : insets.top;

  const selectedConn = connections.find((c) => c.id === selectedConnId) ?? activeConnection ?? null;
  const selectedSkill = skills.find((s) => s.id === selectedSkillId);

  const appendLine = (line: Omit<TerminalLine, 'id' | 'timestamp'>) => {
    setLines((prev) => [...prev, { ...line, id: genId(), timestamp: new Date().toLocaleTimeString() }]);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
  };

  // Subscribe to AIs & Ears bridge messages
  useEffect(() => {
    const unsub = subscribe((msg) => {
      if (msg.type === 'vision_response') {
        appendLine({ type: 'vision', content: `[Leo sees ${msg.source}] ${msg.content}`, source: msg.source });
      } else if (msg.type === 'transcript') {
        appendLine({ type: 'transcript', content: `[Leo hears] ${msg.content}` });
      } else if (msg.type === 'bridge_status') {
        appendLine({ type: 'system', content: msg.content });
      } else if (msg.type === 'bridge_error') {
        appendLine({ type: 'error', content: msg.content });
      }
    });
    return unsub;
  }, [subscribe]);

  // Camera capture interval
  useEffect(() => {
    if (cameraOn && session) {
      if (!cameraGranted) {
        ImagePicker.requestCameraPermissionsAsync().then((result) => {
          setCameraGranted(result.granted);
          if (!result.granted) {
            appendLine({ type: 'error', content: 'Camera permission denied. Enable in Settings.' });
          }
        });
      }
      cameraIntervalRef.current = setInterval(async () => {
        if (!cameraRef.current) return;
        try {
          const photo = await cameraRef.current.takePictureAsync({ base64: true, quality: 0.4 });
          if (photo?.base64) {
            await sendVisionFrame(`data:image/jpeg;base64,${photo.base64}`, 'camera');
          }
        } catch {}
      }, VISION_INTERVAL_MS);
    } else {
      if (cameraIntervalRef.current) {
        clearInterval(cameraIntervalRef.current);
        cameraIntervalRef.current = null;
      }
    }
    return () => {
      if (cameraIntervalRef.current) {
        clearInterval(cameraIntervalRef.current);
        cameraIntervalRef.current = null;
      }
    };
  }, [cameraOn, session, cameraGranted]);

  // Cursor control interval — direct Grok Vision, no AIs & Ears needed
  useEffect(() => {
    if (controlOn && selectedConn) {
      controlIntervalRef.current = setInterval(async () => {
        if (!screenCaptureRef.current) return;
        try {
          const base64 = await captureRef(screenCaptureRef, { format: 'jpg', quality: 0.5, result: 'base64' });
          if (!base64) return;
          const messages: ChatMessage[] = [{
            role: 'user',
            content: 'Here is my current Middlemain screen. Describe what you see briefly and optionally move your cursor.',
          }];
          let fullResponse = '';
          await sendMessage(
            selectedConn.id,
            messages,
            (chunk) => { fullResponse += chunk; },
            () => {
              const action = parseCursorAction(fullResponse);
              if (action) {
                setCursorAction({ ...action });
                if (action.scroll) {
                  const delta = action.scroll.direction === 'down' ? action.scroll.px : -action.scroll.px;
                  scrollRef.current?.scrollTo({ y: delta, animated: true });
                }
              }
              const stripped = stripCursorBlock(fullResponse).trim();
              if (stripped) {
                appendLine({ type: 'vision', content: `[Leo cursor] ${stripped}`, source: 'screen' });
                setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 30);
              }
            },
            (err) => appendLine({ type: 'error', content: `[cursor control error] ${err}` }),
            base64,
            CURSOR_CONTROL_SYSTEM_PROMPT,
          );
        } catch {}
      }, CONTROL_INTERVAL_MS);
    } else {
      if (controlIntervalRef.current) {
        clearInterval(controlIntervalRef.current);
        controlIntervalRef.current = null;
      }
    }
    return () => {
      if (controlIntervalRef.current) {
        clearInterval(controlIntervalRef.current);
        controlIntervalRef.current = null;
      }
    };
  }, [controlOn, selectedConn]);

  // Screen capture interval
  useEffect(() => {
    if (screenOn && session) {
      screenIntervalRef.current = setInterval(async () => {
        if (!screenCaptureRef.current) return;
        try {
          const base64 = await captureRef(screenCaptureRef, {
            format: 'jpg',
            quality: 0.5,
            result: 'base64',
          });
          if (base64) {
            await sendVisionFrame(`data:image/jpeg;base64,${base64}`, 'screen');
          }
        } catch {}
      }, VISION_INTERVAL_MS);
    } else {
      if (screenIntervalRef.current) {
        clearInterval(screenIntervalRef.current);
        screenIntervalRef.current = null;
      }
    }
    return () => {
      if (screenIntervalRef.current) {
        clearInterval(screenIntervalRef.current);
        screenIntervalRef.current = null;
      }
    };
  }, [screenOn, session]);

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.7,
      base64: true,
    });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      if (asset.base64) {
        setAttachedImage({ uri: asset.uri, base64: asset.base64 });
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        if (!selectedSkill?.supportsVision) setSelectedSkillId('vision_ui');
      }
    }
  };

  const takePhoto = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      appendLine({ type: 'error', content: 'Camera permission required. Enable it in Settings.' });
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: true,
      quality: 0.7,
      base64: true,
    });
    if (!result.canceled && result.assets[0]) {
      const asset = result.assets[0];
      if (asset.base64) {
        setAttachedImage({ uri: asset.uri, base64: asset.base64 });
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        if (!selectedSkill?.supportsVision) setSelectedSkillId('vision_debug');
      }
    }
  };

  const execute = async () => {
    const text = input.trim();
    if (!text && !attachedImage) return;
    if (!selectedConn) {
      appendLine({ type: 'error', content: 'No AI connection selected. Add one in the Connect tab.' });
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const skill = skills.find((s) => s.id === selectedSkillId);
    const prefix = skill?.promptPrefix ?? '';
    const fullText = prefix + (text || 'Analyze the attached image.');

    if (attachedImage) {
      appendLine({ type: 'image', content: 'Attached image', imageUri: attachedImage.uri });
    }
    if (text) {
      appendLine({ type: 'input', content: `[${skill?.name ?? selectedSkillId}] ${text}` });
    }

    setInput('');
    const capturedImage = attachedImage;
    setAttachedImage(null);
    setIsStreaming(true);
    setStreamingLine('');

    const messages: ChatMessage[] = [{ role: 'user', content: fullText }];
    let accumulated = '';

    const connWithSkill = skill
      ? { ...selectedConn, systemPrompt: skill.systemPrompt }
      : selectedConn;

    await sendMessage(
      selectedConn.id,
      messages,
      (chunk) => {
        accumulated += chunk;
        setStreamingLine(accumulated);
        setTimeout(() => scrollRef.current?.scrollToEnd({ animated: false }), 20);
      },
      () => {
        setIsStreaming(false);
        setStreamingLine('');
        appendLine({ type: 'output', content: accumulated });
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      },
      (err) => {
        setIsStreaming(false);
        setStreamingLine('');
        appendLine({ type: 'error', content: `Error: ${err}` });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      },
      capturedImage?.base64,
    );
  };

  const clearTerminal = () => {
    setLines([{ id: genId(), type: 'system', content: '>>> Terminal cleared.', timestamp: new Date().toLocaleTimeString() }]);
    setAttachedImage(null);
  };

  const copyLast = async () => {
    const last = [...lines].reverse().find((l) => l.type === 'output');
    if (last) {
      await Clipboard.setStringAsync(last.content);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
  };

  const lineColor: Record<TerminalLine['type'], string> = {
    input: theme.secondary,
    output: theme.text,
    system: theme.textMuted,
    error: theme.destructive,
    image: theme.accent,
    vision: '#00ff88',
    transcript: '#aa88ff',
  };

  const visionSkills = skills.filter((s) => s.supportsVision);
  const textSkills = skills.filter((s) => !s.supportsVision);
  const displaySkills = attachedImage ? skills : textSkills;

  const bridgeConnected = bridgeStatus === 'connected';
  const anySenseOn = hearingOn || cameraOn || screenOn || controlOn;

  const handleToggleControl = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (!selectedConn) {
      appendLine({ type: 'error', content: 'Connect an AI first — Leo needs a Vision connection to use cursor control.' });
      return;
    }
    const next = !controlOn;
    setControlOn(next);
    if (!next) setCursorAction(null);
    appendLine({
      type: 'system',
      content: next
        ? '>>> Leo cursor control ACTIVE — Leo will see your screen and move the cursor'
        : '>>> Leo cursor control deactivated',
    });
  };

  const handleToggleCamera = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (!bridgeConnected) {
      appendLine({ type: 'error', content: 'Connect AIs & Ears bridge in the Connect tab first.' });
      return;
    }
    toggleCamera();
  };

  const handleToggleHearing = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (!bridgeConnected) {
      appendLine({ type: 'error', content: 'Connect AIs & Ears bridge in the Connect tab first.' });
      return;
    }
    toggleHearing();
  };

  const handleToggleScreen = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (!bridgeConnected) {
      appendLine({ type: 'error', content: 'Connect AIs & Ears bridge in the Connect tab first.' });
      return;
    }
    toggleScreen();
  };

  return (
    <ThemedBackground>
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      {/* Header */}
      <View style={{ paddingTop: topInset + 10, paddingHorizontal: 16, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: theme.border, backgroundColor: theme.surface + 'E6' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <NeonText size={15} weight="700" letterSpacing={3}>BRIDGE TERMINAL</NeonText>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <NetworkStatusBar />
            <TouchableOpacity onPress={copyLast} style={{ padding: 6 }}>
              <Feather name="copy" size={17} color={theme.textMuted} />
            </TouchableOpacity>
            <TouchableOpacity onPress={clearTerminal} style={{ padding: 6 }}>
              <Feather name="trash-2" size={17} color={theme.textMuted} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Leo's Senses Toggle Strip */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
          <Text style={{ color: theme.textMuted, fontSize: 9, fontFamily: 'Inter_600SemiBold', letterSpacing: 1, marginRight: 2 }}>
            LEO'S SENSES
          </Text>

          {/* Hearing */}
          <TouchableOpacity
            onPress={handleToggleHearing}
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 4,
              paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12,
              borderWidth: 1,
              borderColor: hearingOn ? '#aa88ff' : theme.border,
              backgroundColor: hearingOn ? '#aa88ff22' : 'transparent',
            }}
          >
            <Feather name="mic" size={11} color={hearingOn ? '#aa88ff' : theme.textMuted} />
            <Text style={{ color: hearingOn ? '#aa88ff' : theme.textMuted, fontSize: 10, fontFamily: 'Inter_600SemiBold' }}>HEAR</Text>
            {hearingOn && <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: '#aa88ff' }} />}
          </TouchableOpacity>

          {/* Camera */}
          <TouchableOpacity
            onPress={handleToggleCamera}
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 4,
              paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12,
              borderWidth: 1,
              borderColor: cameraOn ? '#00ff88' : theme.border,
              backgroundColor: cameraOn ? '#00ff8822' : 'transparent',
            }}
          >
            <Feather name="video" size={11} color={cameraOn ? '#00ff88' : theme.textMuted} />
            <Text style={{ color: cameraOn ? '#00ff88' : theme.textMuted, fontSize: 10, fontFamily: 'Inter_600SemiBold' }}>CAM</Text>
            {cameraOn && <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: '#00ff88' }} />}
          </TouchableOpacity>

          {/* Screen */}
          <TouchableOpacity
            onPress={handleToggleScreen}
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 4,
              paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12,
              borderWidth: 1,
              borderColor: screenOn ? theme.accent : theme.border,
              backgroundColor: screenOn ? theme.accent + '22' : 'transparent',
            }}
          >
            <Feather name="monitor" size={11} color={screenOn ? theme.accent : theme.textMuted} />
            <Text style={{ color: screenOn ? theme.accent : theme.textMuted, fontSize: 10, fontFamily: 'Inter_600SemiBold' }}>SCREEN</Text>
            {screenOn && <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: theme.accent }} />}
          </TouchableOpacity>

          {/* Cursor Control */}
          <TouchableOpacity
            onPress={handleToggleControl}
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 4,
              paddingHorizontal: 10, paddingVertical: 5, borderRadius: 12,
              borderWidth: controlOn ? 1.5 : 1,
              borderColor: controlOn ? theme.primary : theme.border,
              backgroundColor: controlOn ? theme.primary + '22' : 'transparent',
            }}
          >
            <Feather name="crosshair" size={11} color={controlOn ? theme.primary : theme.textMuted} />
            <Text style={{ color: controlOn ? theme.primary : theme.textMuted, fontSize: 10, fontFamily: 'Inter_600SemiBold' }}>CTRL</Text>
            {controlOn && <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: theme.primary }} />}
          </TouchableOpacity>

          {/* Status dots */}
          <View style={{ marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            {controlOn && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: theme.primary }} />
                <Text style={{ color: theme.primary, fontSize: 9, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.5 }}>CTRL</Text>
              </View>
            )}
            {bridgeConnected && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#00ff88' }} />
                <Text style={{ color: '#00ff88', fontSize: 9, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.5 }}>BRIDGED</Text>
              </View>
            )}
          </View>
        </View>

        {/* AI selector */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {connections.length === 0 ? (
              <TouchableOpacity
                onPress={() => router.push('/(tabs)/connections')}
                style={{ paddingHorizontal: 12, paddingVertical: 5, borderRadius: 6, borderWidth: 1, borderColor: theme.primary, borderStyle: 'dashed' }}
              >
                <Text style={{ color: theme.primary, fontSize: 12, fontFamily: 'Inter_600SemiBold' }}>+ Add AI</Text>
              </TouchableOpacity>
            ) : connections.map((c) => (
              <TouchableOpacity
                key={c.id}
                onPress={() => setSelectedConnId(c.id)}
                style={{
                  paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6, borderWidth: 1,
                  borderColor: selectedConnId === c.id ? theme.primary : theme.border,
                  backgroundColor: selectedConnId === c.id ? theme.primary + '22' : 'transparent',
                }}
              >
                <Text style={{ color: selectedConnId === c.id ? theme.primary : theme.textMuted, fontSize: 11, fontFamily: 'Inter_600SemiBold' }}>
                  {c.name}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>

        {/* Skills selector */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {displaySkills.map((skill) => (
              <TouchableOpacity
                key={skill.id}
                onPress={() => setSelectedSkillId(skill.id)}
                style={{
                  paddingHorizontal: 10, paddingVertical: 4, borderRadius: 4, borderWidth: 1,
                  borderColor: selectedSkillId === skill.id
                    ? (skill.supportsVision ? theme.accent : theme.secondary)
                    : theme.border,
                  backgroundColor: selectedSkillId === skill.id
                    ? (skill.supportsVision ? theme.accent + '22' : theme.secondary + '22')
                    : 'transparent',
                  flexDirection: 'row', alignItems: 'center', gap: 4,
                }}
              >
                <Feather
                  name={skill.icon as any}
                  size={11}
                  color={selectedSkillId === skill.id
                    ? (skill.supportsVision ? theme.accent : theme.secondary)
                    : theme.textMuted}
                />
                <Text style={{
                  color: selectedSkillId === skill.id
                    ? (skill.supportsVision ? theme.accent : theme.secondary)
                    : theme.textMuted,
                  fontSize: 11, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.5,
                }}>
                  {skill.name.toUpperCase()}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>

        {/* Vision badge */}
        {attachedImage && (
          <View style={{ marginTop: 8, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={{ backgroundColor: theme.accent + '22', borderWidth: 1, borderColor: theme.accent, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Feather name="eye" size={11} color={theme.accent} />
              <Text style={{ color: theme.accent, fontSize: 10, fontFamily: 'Inter_600SemiBold', letterSpacing: 1 }}>VISION MODE</Text>
            </View>
            <Text style={{ color: theme.textMuted, fontSize: 10, fontFamily: 'Inter_400Regular' }}>
              Image attached · grok-2-vision-1212
            </Text>
          </View>
        )}
      </View>

      {/* Hidden CameraView for frame capture — native only */}
      {Platform.OS !== 'web' && cameraOn && cameraGranted && (() => {
        const NativeCameraView = (require('expo-camera') as typeof import('expo-camera')).CameraView;
        return <NativeCameraView ref={cameraRef} facing="front" style={{ position: 'absolute', width: 1, height: 1, opacity: 0 }} />;
      })()}

      {/* Terminal output — wrapped for screen capture */}
      <View
        ref={screenCaptureRef}
        style={{ flex: 1 }}
        onLayout={(e) => setContainerSize({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}
      >
        {/* AI cursor overlay — floats above terminal when CTRL is active */}
        <AICursorOverlay
          visible={controlOn}
          action={cursorAction}
          containerWidth={containerSize.width}
          containerHeight={containerSize.height}
        />
        <ScrollView
          ref={scrollRef}
          style={{ flex: 1, padding: 12 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {lines.map((line) => (
            <View key={line.id} style={{ marginBottom: 12 }}>
              <Text style={{ color: theme.textMuted, fontSize: 9, fontFamily: 'Inter_400Regular', marginBottom: 2 }}>
                {line.timestamp}
              </Text>
              {line.type === 'image' && line.imageUri ? (
                <View>
                  <Image
                    source={{ uri: line.imageUri }}
                    style={{ width: 160, height: 120, borderRadius: 8, borderWidth: 1, borderColor: theme.accent }}
                    resizeMode="cover"
                  />
                  <Text style={{ color: theme.accent, fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: 4 }}>
                    [image attached for analysis]
                  </Text>
                </View>
              ) : (
                <Text
                  style={{
                    color: lineColor[line.type],
                    fontSize: 13,
                    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
                    lineHeight: 20,
                  }}
                  selectable
                >
                  {line.type === 'input' ? '> ' : line.type === 'system' ? '' : line.type === 'error' ? '! ' : ''}{line.content}
                </Text>
              )}
            </View>
          ))}

          {isStreaming && (
            <View style={{ marginBottom: 12 }}>
              <Text style={{ color: theme.textMuted, fontSize: 9, fontFamily: 'Inter_400Regular', marginBottom: 2 }}>
                {new Date().toLocaleTimeString()}
              </Text>
              <Text style={{ color: theme.text, fontSize: 13, fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace', lineHeight: 20 }}>
                {streamingLine || ''}
                <Text style={{ color: theme.primary }}>█</Text>
              </Text>
            </View>
          )}
          <View style={{ height: 20 }} />
        </ScrollView>
      </View>

      {/* Attached image preview strip */}
      {attachedImage && (
        <View style={{ backgroundColor: theme.surface + 'E6', paddingHorizontal: 12, paddingVertical: 8, borderTopWidth: 1, borderTopColor: theme.accent + '66', flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Image source={{ uri: attachedImage.uri }} style={{ width: 48, height: 48, borderRadius: 6, borderWidth: 1, borderColor: theme.accent }} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: theme.accent, fontSize: 12, fontFamily: 'Inter_600SemiBold' }}>Image ready for analysis</Text>
            <Text style={{ color: theme.textMuted, fontSize: 10, fontFamily: 'Inter_400Regular' }}>Grok Vision will analyze this</Text>
          </View>
          <TouchableOpacity onPress={() => setAttachedImage(null)} style={{ padding: 6 }}>
            <Feather name="x" size={16} color={theme.textMuted} />
          </TouchableOpacity>
        </View>
      )}

      {/* Input bar */}
      <View style={{
        borderTopWidth: 1, borderTopColor: theme.border, backgroundColor: theme.surface + 'E6',
        paddingBottom: Platform.OS === 'web' ? 34 : (insets.bottom > 0 ? insets.bottom : 10),
        paddingTop: 10, paddingHorizontal: 12,
      }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
          {/* Vision attach buttons */}
          <View style={{ flexDirection: 'column', gap: 4 }}>
            <TouchableOpacity
              onPress={pickImage}
              disabled={isStreaming}
              style={{ width: 36, height: 36, borderRadius: 8, borderWidth: 1, borderColor: theme.accent, alignItems: 'center', justifyContent: 'center', backgroundColor: attachedImage ? theme.accent + '22' : 'transparent' }}
            >
              <Feather name="image" size={16} color={theme.accent} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={takePhoto}
              disabled={isStreaming}
              style={{ width: 36, height: 36, borderRadius: 8, borderWidth: 1, borderColor: theme.accent, alignItems: 'center', justifyContent: 'center' }}
            >
              <Feather name="camera" size={16} color={theme.accent} />
            </TouchableOpacity>
          </View>

          <TextInput
            style={{
              flex: 1,
              backgroundColor: theme.background,
              borderWidth: 1,
              borderColor: isStreaming ? theme.border : theme.primary,
              borderRadius: theme.radius,
              color: theme.text,
              fontSize: 13,
              fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
              paddingHorizontal: 14,
              paddingVertical: 10,
              maxHeight: 120,
              textAlignVertical: 'top',
            }}
            value={input}
            onChangeText={setInput}
            placeholder={
              attachedImage
                ? 'Describe what to look for (optional)...'
                : selectedSkill?.id === 'chat'
                  ? 'Chat with your AI...'
                  : `${selectedSkill?.name ?? 'Execute'}: paste code or describe...`
            }
            placeholderTextColor={theme.textMuted}
            multiline
            editable={!isStreaming}
          />

          <TouchableOpacity
            onPress={execute}
            disabled={isStreaming || (!input.trim() && !attachedImage)}
            style={{
              width: 44, height: 44, borderRadius: 22,
              backgroundColor: isStreaming ? theme.surface : theme.primary,
              alignItems: 'center', justifyContent: 'center',
              shadowColor: theme.primary, shadowOffset: { width: 0, height: 0 },
              shadowRadius: 10, shadowOpacity: isStreaming ? 0 : 0.7,
              opacity: (!input.trim() && !attachedImage && !isStreaming) ? 0.4 : 1,
            }}
          >
            <Feather name={isStreaming ? 'loader' : 'send'} size={18} color={theme.background} />
          </TouchableOpacity>
        </View>
      </View>

      <AdBanner onUpgradePress={() => router.push('/(tabs)/settings')} />
    </KeyboardAvoidingView>
    </ThemedBackground>
  );
}
