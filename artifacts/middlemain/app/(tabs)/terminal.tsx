import { Feather } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import React, { useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AdBanner } from '@/components/AdBanner';
import { NeonText } from '@/components/NeonText';
import { useAI } from '@/context/AIContext';
import { useTheme } from '@/context/ThemeContext';

type ActionMode = 'analyze' | 'debug' | 'explain' | 'transform' | 'chat';

const ACTION_PROMPTS: Record<ActionMode, string> = {
  analyze: 'Analyze this code and identify any issues, improvements, and best practices:',
  debug: 'Debug this code and explain what is wrong and how to fix it:',
  explain: 'Explain this code clearly and concisely, step by step:',
  transform: 'Refactor and improve this code while maintaining functionality:',
  chat: '',
};

interface TerminalLine {
  id: string;
  type: 'input' | 'output' | 'system' | 'error';
  content: string;
  timestamp: string;
}

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

export default function TerminalScreen() {
  const { theme } = useTheme();
  const { connections, activeConnection, sendMessage } = useAI();
  const insets = useSafeAreaInsets();

  const [input, setInput] = useState('');
  const [lines, setLines] = useState<TerminalLine[]>([
    {
      id: genId(),
      type: 'system',
      content: '>>> MIDDLEMAIN BRIDGE TERMINAL v0.1 <<<\n>>> Universal AI Development Bridge\n>>> Type code or a prompt, select an action, and execute.',
      timestamp: new Date().toLocaleTimeString(),
    },
  ]);
  const [actionMode, setActionMode] = useState<ActionMode>('chat');
  const [selectedConnId, setSelectedConnId] = useState<string>(activeConnection?.id ?? '');
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingLine, setStreamingLine] = useState<string>('');
  const scrollRef = useRef<ScrollView>(null);
  const topInset = Platform.OS === 'web' ? 67 : insets.top;

  const selectedConn = connections.find((c) => c.id === selectedConnId) ?? activeConnection ?? null;

  const appendLine = (line: Omit<TerminalLine, 'id' | 'timestamp'>) => {
    setLines((prev) => [...prev, { ...line, id: genId(), timestamp: new Date().toLocaleTimeString() }]);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
  };

  const execute = async () => {
    if (!input.trim()) return;
    if (!selectedConn) {
      appendLine({ type: 'error', content: 'No AI connection selected. Add one in the Connections tab.' });
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    const userContent = input.trim();
    const prompt = ACTION_PROMPTS[actionMode];
    const fullContent = prompt ? `${prompt}\n\n${userContent}` : userContent;

    appendLine({ type: 'input', content: `[${actionMode.toUpperCase()}] ${userContent}` });
    setInput('');
    setIsStreaming(true);
    setStreamingLine('');

    let accumulated = '';

    await sendMessage(
      selectedConn.id,
      [{ role: 'user', content: fullContent }],
      (chunk) => {
        accumulated += chunk;
        setStreamingLine(accumulated);
        setTimeout(() => scrollRef.current?.scrollToEnd({ animated: false }), 20);
      },
      () => {
        setIsStreaming(false);
        const final = accumulated;
        setStreamingLine('');
        appendLine({ type: 'output', content: final });
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      },
      (err) => {
        setIsStreaming(false);
        setStreamingLine('');
        appendLine({ type: 'error', content: `Error: ${err}` });
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      },
    );
  };

  const clearTerminal = () => {
    setLines([{
      id: genId(),
      type: 'system',
      content: '>>> Terminal cleared.',
      timestamp: new Date().toLocaleTimeString(),
    }]);
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
  };

  const linePrefix: Record<TerminalLine['type'], string> = {
    input: '> ',
    output: '',
    system: '# ',
    error: '! ',
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: theme.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={0}
    >
      {/* Header */}
      <View style={{ paddingTop: topInset + 10, paddingHorizontal: 16, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: theme.border, backgroundColor: theme.surface }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <NeonText size={16} weight="700" letterSpacing={3}>BRIDGE TERMINAL</NeonText>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity onPress={copyLast} style={{ padding: 6 }}>
              <Feather name="copy" size={18} color={theme.textMuted} />
            </TouchableOpacity>
            <TouchableOpacity onPress={clearTerminal} style={{ padding: 6 }}>
              <Feather name="trash-2" size={18} color={theme.textMuted} />
            </TouchableOpacity>
          </View>
        </View>

        {/* AI Selector */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {connections.length === 0 ? (
              <TouchableOpacity
                onPress={() => router.push('/(tabs)/connections')}
                style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6, borderWidth: 1, borderColor: theme.primary, borderStyle: 'dashed' }}
              >
                <Text style={{ color: theme.primary, fontSize: 12, fontFamily: 'Inter_600SemiBold' }}>+ Add AI</Text>
              </TouchableOpacity>
            ) : (
              connections.map((c) => (
                <TouchableOpacity
                  key={c.id}
                  onPress={() => setSelectedConnId(c.id)}
                  style={{
                    paddingHorizontal: 12,
                    paddingVertical: 6,
                    borderRadius: 6,
                    borderWidth: 1,
                    borderColor: selectedConnId === c.id ? theme.primary : theme.border,
                    backgroundColor: selectedConnId === c.id ? theme.primary + '22' : 'transparent',
                  }}
                >
                  <Text style={{ color: selectedConnId === c.id ? theme.primary : theme.textMuted, fontSize: 12, fontFamily: 'Inter_600SemiBold' }}>
                    {c.name}
                  </Text>
                </TouchableOpacity>
              ))
            )}
          </View>
        </ScrollView>

        {/* Action Mode */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {(['chat', 'analyze', 'debug', 'explain', 'transform'] as ActionMode[]).map((mode) => (
              <TouchableOpacity
                key={mode}
                onPress={() => setActionMode(mode)}
                style={{
                  paddingHorizontal: 10,
                  paddingVertical: 4,
                  borderRadius: 4,
                  borderWidth: 1,
                  borderColor: actionMode === mode ? theme.secondary : theme.border,
                  backgroundColor: actionMode === mode ? theme.secondary + '22' : 'transparent',
                }}
              >
                <Text style={{ color: actionMode === mode ? theme.secondary : theme.textMuted, fontSize: 11, fontFamily: 'Inter_600SemiBold', letterSpacing: 1 }}>
                  {mode.toUpperCase()}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      </View>

      {/* Terminal output */}
      <ScrollView
        ref={scrollRef}
        style={{ flex: 1, padding: 12 }}
        showsVerticalScrollIndicator={false}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
        keyboardShouldPersistTaps="handled"
      >
        {lines.map((line) => (
          <View key={line.id} style={{ marginBottom: 10 }}>
            <Text style={{ color: theme.textMuted, fontSize: 9, fontFamily: 'Inter_400Regular', marginBottom: 2 }}>
              {line.timestamp}
            </Text>
            <Text
              style={{
                color: lineColor[line.type],
                fontSize: 13,
                fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
                lineHeight: 20,
              }}
              selectable
            >
              {linePrefix[line.type]}{line.content}
            </Text>
          </View>
        ))}

        {/* Streaming line */}
        {isStreaming && streamingLine !== '' && (
          <View style={{ marginBottom: 10 }}>
            <Text style={{ color: theme.textMuted, fontSize: 9, fontFamily: 'Inter_400Regular', marginBottom: 2 }}>
              {new Date().toLocaleTimeString()}
            </Text>
            <Text
              style={{
                color: theme.text,
                fontSize: 13,
                fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
                lineHeight: 20,
              }}
            >
              {streamingLine}
              <Text style={{ color: theme.primary }}>█</Text>
            </Text>
          </View>
        )}
        {isStreaming && streamingLine === '' && (
          <Text style={{ color: theme.primary, fontSize: 13, fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace' }}>
            ···
          </Text>
        )}
        <View style={{ height: 20 }} />
      </ScrollView>

      {/* Input */}
      <View style={{ borderTopWidth: 1, borderTopColor: theme.border, backgroundColor: theme.surface, paddingBottom: Platform.OS === 'web' ? 34 : (insets.bottom > 0 ? insets.bottom : 10), paddingTop: 10, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'flex-end', gap: 10 }}>
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
          placeholder={actionMode === 'chat' ? 'Chat with your AI...' : 'Paste code or describe what to ' + actionMode + '...'}
          placeholderTextColor={theme.textMuted}
          multiline
          editable={!isStreaming}
        />
        <TouchableOpacity
          onPress={execute}
          disabled={isStreaming || !input.trim()}
          style={{
            width: 44,
            height: 44,
            borderRadius: 22,
            backgroundColor: isStreaming ? theme.surface : theme.primary,
            alignItems: 'center',
            justifyContent: 'center',
            shadowColor: theme.primary,
            shadowOffset: { width: 0, height: 0 },
            shadowRadius: 10,
            shadowOpacity: isStreaming ? 0 : 0.7,
            opacity: (!input.trim() && !isStreaming) ? 0.4 : 1,
          }}
        >
          <Feather name={isStreaming ? 'loader' : 'send'} size={18} color={theme.background} />
        </TouchableOpacity>
      </View>
      <AdBanner onUpgradePress={() => router.push('/(tabs)/settings')} />
    </KeyboardAvoidingView>
  );
}
