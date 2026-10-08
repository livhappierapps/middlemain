import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Linking,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ThemedBackground } from '@/components/ThemedBackground';
import { AIProvider, ChatMessage, GuideSource, useAI } from '@/context/AIContext';
import { useTheme } from '@/context/ThemeContext';

const PRICING_AS_OF = 'October 8, 2026';

const PROVIDER_INFO: {
  key: AIProvider;
  label: string;
  model: string;
  inputPrice: string;
  outputPrice: string;
  pricingUrl: string;
}[] = [
  {
    key: 'openai',
    label: 'OpenAI',
    model: 'gpt-5-mini',
    inputPrice: '$0.25',
    outputPrice: '$2.00',
    pricingUrl: 'https://developers.openai.com/api/docs/models/gpt-5-mini',
  },
  {
    key: 'anthropic',
    label: 'Anthropic',
    model: 'claude-sonnet-5-5',
    inputPrice: '$2.00',
    outputPrice: '$10.00',
    pricingUrl: 'https://www.anthropic.com/claude-sonnet-5-5',
  },
  {
    key: 'xai',
    label: 'xAI',
    model: 'grok-4.7',
    inputPrice: '$2.00',
    outputPrice: '$6.00',
    pricingUrl: 'https://docs.x.ai/developers/models/grok-4.7',
  },
  {
    key: 'gemini',
    label: 'Gemini',
    model: 'gemini-3.8-flash',
    inputPrice: '$0.75',
    outputPrice: '$3.75',
    pricingUrl: 'https://ai.google.dev/gemini-api/docs/pricing',
  },
];

const HELP_TOPICS: {
  keywords: string[];
  answer: string;
}[] = [
  {
    keywords: ['offline', 'without a network', 'no network', 'without internet'],
    answer:
      'Built-in Middlemain help works offline, sends no question to a provider, and does not incur an AI or search charge. General AI answers and live web search need a selected provider connection and may incur charges.',
  },
  {
    keywords: ['price', 'cost', 'charge', 'billing', 'web search', 'grounding'],
    answer:
      'Built-in Middlemain help is available offline and does not send your question anywhere. General AI answers use the provider and model you select and may be billed by that provider. Gemini Google Search grounding can add a separate search charge; check the rates and links shown in this guide.',
  },
  {
    keywords: ['memory', 'mcp', 'tool'],
    answer:
      'To connect memory tools, open Connect, find Memory Bridge, enter the service URL and token from that service, and tap Connect. When connected, each listed tool has a help button with the description and input fields advertised by its own schema.',
  },
  {
    keywords: ['privacy', 'api key', 'key'],
    answer:
      'AI connection keys are saved on this device. When you ask an AI provider a question, the message is sent to the selected provider; Middlemain cannot promise how that provider handles your data. Avoid including passwords, private keys, or other sensitive information.',
  },
  {
    keywords: ['debug', 'code', 'dry run', 'typecheck', 'build'],
    answer:
      'Open Debug, choose the code type, and paste the code or use Paste. AI Analyze sends the code for an AI review. Dry Run checks TypeScript-compatible input with the app’s configured checker. Review the result before building; an AI review is not a guarantee that a build will succeed.',
  },
  {
    keywords: ['council', 'participant', 'role', 'team'],
    answer:
      'In Council, add AI participants from your saved connections, give each one a clear role, then describe the goal in the message box. You can run a regular conversation or start an automatic multi-participant session.',
  },
  {
    keywords: ['terminal', 'bridge', 'image', 'photo', 'chat'],
    answer:
      'In Bridge, select a saved AI connection and a task from the skill row, then type a question and send it. You can also attach an image when you want help interpreting a screenshot or photo. Camera, microphone, and screen sharing require the separate AIs & Ears bridge.',
  },
  {
    keywords: ['connect', 'provider', 'openai', 'anthropic', 'gemini', 'grok', 'xai'],
    answer:
      'Open Connect, tap the plus button, choose a provider, and enter a connection name, API key, and model ID. Tap Save, then use Test to check that the settings work. Provider keys and usage are managed by you and the provider.',
  },
];

const GUIDE_SYSTEM_PROMPT =
  'You are a helpful guide in Middlemain. Answer the user directly in plain language. Do not claim certainty when you are unsure. For questions about Middlemain, distinguish what is known from what may depend on their app version or provider. If web search was used, describe what the cited sources support and do not invent citations.';

type GuideMode = 'help' | 'ai';
type ProviderChoice = AIProvider | 'existing';
type GuideMessage = {
  id: string;
  role: 'user' | 'assistant';
  mode: GuideMode;
  content: string;
  sources?: GuideSource[];
};

function getBuiltInAnswer(question: string): string {
  const normalized = question.toLowerCase();
  const topic = HELP_TOPICS.find(({ keywords }) =>
    keywords.some((keyword) => normalized.includes(keyword)),
  );
  return topic?.answer
    ?? 'This offline guide only answers questions covered by built-in Middlemain help. It has not sent your question anywhere. Switch to Ask AI for general questions; a selected provider may charge for its answer.';
}

function makeId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function GuideScreen() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const { connections, activeConnection, sendGuideMessage } = useAI();
  const [mode, setMode] = useState<GuideMode>('help');
  const [providerChoice, setProviderChoice] = useState<ProviderChoice>('existing');
  const [selectedConnectionId, setSelectedConnectionId] = useState('');
  const [useGoogleSearch, setUseGoogleSearch] = useState(false);
  const [question, setQuestion] = useState('');
  const [messages, setMessages] = useState<GuideMessage[]>([]);
  const [isSending, setIsSending] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const topInset = Platform.OS === 'web' ? 67 : insets.top;
  const selectedConnection =
    connections.find((connection) => connection.id === selectedConnectionId) ?? null;

  useEffect(() => {
    if (selectedConnectionId) return;
    if (providerChoice === 'existing' && activeConnection) {
      setSelectedConnectionId(activeConnection.id);
    } else if (providerChoice !== 'existing') {
      const providerConnection = connections.find((connection) => connection.provider === providerChoice);
      if (providerConnection) setSelectedConnectionId(providerConnection.id);
    }
  }, [activeConnection, connections, providerChoice, selectedConnectionId]);

  useEffect(() => {
    scrollRef.current?.scrollToEnd({ animated: true });
  }, [messages, isSending]);

  const selectProvider = (provider: AIProvider) => {
    setProviderChoice(provider);
    const match = connections.find((connection) => connection.provider === provider);
    setSelectedConnectionId(match?.id ?? '');
    if (provider !== 'gemini') setUseGoogleSearch(false);
  };

  const selectExisting = () => {
    setProviderChoice('existing');
    const match = connections.find((connection) => connection.id === selectedConnectionId)
      ?? activeConnection
      ?? connections[0];
    setSelectedConnectionId(match?.id ?? '');
    if (match?.provider !== 'gemini') setUseGoogleSearch(false);
  };

  const openPricing = async (url: string) => {
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert('Could not open link', 'Check your internet connection and try again.');
    }
  };

  const handleSend = async () => {
    const text = question.trim();
    if (!text || isSending) return;

    const userMessage: GuideMessage = { id: makeId(), role: 'user', mode, content: text };
    setQuestion('');
    setMessages((previous) => [...previous, userMessage]);

    if (mode === 'help') {
      setMessages((previous) => [
        ...previous,
        { id: makeId(), role: 'assistant', mode: 'help', content: getBuiltInAnswer(text) },
      ]);
      return;
    }

    if (!selectedConnection) {
      setMessages((previous) => [
        ...previous,
        {
          id: makeId(),
          role: 'assistant',
          mode: 'ai',
          content: 'Choose a saved AI connection or add one in Connect before sending a general question.',
        },
      ]);
      return;
    }

    const assistantId = makeId();
    const history: ChatMessage[] = [
      ...messages
        .filter((message) => message.mode === 'ai')
        .map((message) => ({ role: message.role, content: message.content })),
      { role: 'user', content: text },
    ];
    setMessages((previous) => [
      ...previous,
      { id: assistantId, role: 'assistant', mode: 'ai', content: '', sources: [] },
    ]);
    setIsSending(true);

    await sendGuideMessage(
      selectedConnection.id,
      history,
      useGoogleSearch,
      (sources) => {
        setMessages((previous) =>
          previous.map((message) => message.id === assistantId ? { ...message, sources } : message),
        );
      },
      (chunk) => {
        setMessages((previous) =>
          previous.map((message) => message.id === assistantId
            ? { ...message, content: message.content + chunk }
            : message),
        );
      },
      () => setIsSending(false),
      (error) => {
        setMessages((previous) =>
          previous.map((message) => message.id === assistantId
            ? {
                ...message,
                content: message.content
                  ? `${message.content}\n\nCould not finish the answer: ${error}`
                  : `Could not get an answer: ${error}`,
              }
            : message),
        );
        setIsSending(false);
      },
      GUIDE_SYSTEM_PROMPT,
    );
  };

  const currentProviderInfo = selectedConnection
    ? PROVIDER_INFO.find((info) => info.key === (selectedConnection.provider === 'server' ? 'xai' : selectedConnection.provider))
    : PROVIDER_INFO.find((info) => info.key === providerChoice);
  const selectedModel = selectedConnection?.model || currentProviderInfo?.model;
  const modelHasPublishedEstimate = !!currentProviderInfo && selectedModel === currentProviderInfo.model;
  const searchAvailable = (selectedConnection?.provider ?? providerChoice) === 'gemini';

  return (
    <ThemedBackground>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={{ flex: 1, paddingTop: topInset + 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingBottom: 12 }}>
            <Feather name="user" size={20} color={theme.primary} />
            <Text accessibilityRole="header" style={{ color: theme.text, fontFamily: 'Inter_700Bold', fontSize: 18, flex: 1 }}>
              Man in the MiddleMain
            </Text>
          </View>

          <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 16, marginBottom: 10 }}>
            {([
              { key: 'help' as const, label: 'Built-in help', icon: 'book-open' as const },
              { key: 'ai' as const, label: 'Ask AI', icon: 'message-circle' as const },
            ]).map((option) => {
              const selected = mode === option.key;
              return (
                <TouchableOpacity
                  key={option.key}
                  onPress={() => setMode(option.key)}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  style={{
                    flex: 1,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 7,
                    borderWidth: 1,
                    borderColor: selected ? theme.primary : theme.border,
                    backgroundColor: selected ? theme.primary + '20' : theme.surface,
                    borderRadius: theme.radius,
                    paddingVertical: 10,
                  }}
                >
                  <Feather name={option.icon} size={14} color={selected ? theme.primary : theme.textMuted} />
                  <Text style={{ color: selected ? theme.primary : theme.textMuted, fontFamily: 'Inter_600SemiBold', fontSize: 12 }}>
                    {option.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={{ marginHorizontal: 16, padding: 10, borderRadius: theme.radius, backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border, marginBottom: 10 }}>
            <Text style={{ color: theme.textMuted, fontFamily: 'Inter_400Regular', fontSize: 11, lineHeight: 16 }}>
              {mode === 'help'
                ? 'No network and no charge: this mode only uses help built into Middlemain. General AI answers and live web search require a selected provider and may incur charges.'
                : 'General answers go to the AI connection you select and may be billed by its provider or connection owner. Answers can be wrong; check important details.'}
            </Text>
          </View>

          {mode === 'ai' && (
            <View style={{ marginBottom: 8 }}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}>
                {PROVIDER_INFO.map((info) => {
                  const selected = providerChoice === info.key;
                  return (
                    <TouchableOpacity
                      key={info.key}
                      onPress={() => selectProvider(info.key)}
                      accessibilityRole="button"
                      accessibilityState={{ selected }}
                      style={{
                        minWidth: 126,
                        maxWidth: 150,
                        paddingHorizontal: 10,
                        paddingVertical: 8,
                        borderRadius: 9,
                        borderWidth: 1,
                        borderColor: selected ? theme.primary : theme.border,
                        backgroundColor: selected ? theme.primary + '20' : theme.surface,
                      }}
                    >
                      <Text numberOfLines={1} style={{ color: selected ? theme.primary : theme.text, fontFamily: 'Inter_600SemiBold', fontSize: 11 }}>
                        {info.label}
                      </Text>
                      <Text numberOfLines={1} style={{ color: theme.textMuted, fontFamily: 'Inter_400Regular', fontSize: 9, marginTop: 3 }}>
                        {info.model}
                      </Text>
                      <Text numberOfLines={1} style={{ color: theme.textMuted, fontFamily: 'Inter_400Regular', fontSize: 9, marginTop: 2 }}>
                        {info.inputPrice} in · {info.outputPrice} out / 1M
                      </Text>
                    </TouchableOpacity>
                  );
                })}
                <TouchableOpacity
                  onPress={selectExisting}
                  accessibilityRole="button"
                  accessibilityState={{ selected: providerChoice === 'existing' }}
                  style={{
                    minWidth: 126,
                    paddingHorizontal: 10,
                    paddingVertical: 8,
                    borderRadius: 9,
                    borderWidth: 1,
                    borderColor: providerChoice === 'existing' ? theme.primary : theme.border,
                    backgroundColor: providerChoice === 'existing' ? theme.primary + '20' : theme.surface,
                  }}
                >
                  <Text style={{ color: providerChoice === 'existing' ? theme.primary : theme.text, fontFamily: 'Inter_600SemiBold', fontSize: 11 }}>
                    Existing connection
                  </Text>
                  <Text style={{ color: theme.textMuted, fontFamily: 'Inter_400Regular', fontSize: 9, marginTop: 3 }}>
                    Use a saved Middlemain connection
                  </Text>
                </TouchableOpacity>
              </ScrollView>

              {providerChoice === 'existing' ? (
                connections.length ? (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, gap: 6, paddingTop: 7 }}>
                    {connections.map((connection) => (
                      <TouchableOpacity
                        key={connection.id}
                        onPress={() => {
                          setSelectedConnectionId(connection.id);
                          if (connection.provider !== 'gemini') setUseGoogleSearch(false);
                        }}
                        accessibilityRole="button"
                        accessibilityState={{ selected: selectedConnectionId === connection.id }}
                        style={{
                          paddingHorizontal: 10,
                          paddingVertical: 6,
                          borderRadius: 7,
                          borderWidth: 1,
                          borderColor: selectedConnectionId === connection.id ? theme.secondary : theme.border,
                          backgroundColor: selectedConnectionId === connection.id ? theme.secondary + '18' : theme.surface,
                        }}
                      >
                        <Text numberOfLines={1} style={{ color: selectedConnectionId === connection.id ? theme.secondary : theme.textMuted, fontFamily: 'Inter_600SemiBold', fontSize: 10 }}>
                          {connection.name} · {connection.model}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                ) : null
              ) : null}

              {selectedConnection ? (
                <View style={{ marginHorizontal: 16, paddingTop: 8 }}>
                  <Text style={{ color: theme.text, fontFamily: 'Inter_600SemiBold', fontSize: 11 }}>
                    Using {selectedConnection.name} · {selectedConnection.model}
                  </Text>
                  {modelHasPublishedEstimate && currentProviderInfo ? (
                    <TouchableOpacity
                      onPress={() => openPricing(currentProviderInfo.pricingUrl)}
                      accessibilityRole="link"
                      style={{ alignSelf: 'flex-start', paddingVertical: 5 }}
                    >
                      <Text style={{ color: theme.primary, fontFamily: 'Inter_400Regular', fontSize: 10 }}>
                        Estimate: {currentProviderInfo.inputPrice} input / {currentProviderInfo.outputPrice} output per 1M tokens · official rates
                      </Text>
                    </TouchableOpacity>
                  ) : (
                    <Text style={{ color: theme.textMuted, fontFamily: 'Inter_400Regular', fontSize: 10, marginTop: 4 }}>
                      No estimate for this model. Check the provider's current rates before sending.
                    </Text>
                  )}
                  {selectedConnection.provider === 'server' ? (
                    <Text style={{ color: theme.textMuted, fontFamily: 'Inter_400Regular', fontSize: 10, lineHeight: 14, marginTop: 2 }}>
                      This routes through a Middlemain server. Its owner may be charged by the provider.
                    </Text>
                  ) : null}
                </View>
              ) : providerChoice !== 'existing' ? (
                <View style={{ marginHorizontal: 16, paddingTop: 8, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={{ flex: 1, color: theme.textMuted, fontFamily: 'Inter_400Regular', fontSize: 10 }}>
                    No saved {PROVIDER_INFO.find((info) => info.key === providerChoice)?.label} connection. Add one before sending.
                  </Text>
                  <TouchableOpacity
                    onPress={() => router.push('/(tabs)/connections')}
                    accessibilityRole="button"
                    style={{ paddingHorizontal: 10, paddingVertical: 7, borderRadius: 7, backgroundColor: theme.primary + '20', borderWidth: 1, borderColor: theme.primary }}
                  >
                    <Text style={{ color: theme.primary, fontFamily: 'Inter_600SemiBold', fontSize: 10 }}>Open Connect</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={{ marginHorizontal: 16, paddingTop: 8, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Text style={{ flex: 1, color: theme.textMuted, fontFamily: 'Inter_400Regular', fontSize: 10 }}>
                    No saved connections yet. Add one to use general AI answers.
                  </Text>
                  <TouchableOpacity
                    onPress={() => router.push('/(tabs)/connections')}
                    accessibilityRole="button"
                    style={{ paddingHorizontal: 10, paddingVertical: 7, borderRadius: 7, backgroundColor: theme.primary + '20', borderWidth: 1, borderColor: theme.primary }}
                  >
                    <Text style={{ color: theme.primary, fontFamily: 'Inter_600SemiBold', fontSize: 10 }}>Open Connect</Text>
                  </TouchableOpacity>
                </View>
              )}

              <View style={{ marginHorizontal: 16, marginTop: 7, padding: 9, borderRadius: 8, borderWidth: 1, borderColor: theme.border, backgroundColor: theme.surface }}>
                <Text style={{ color: theme.textMuted, fontFamily: 'Inter_400Regular', fontSize: 9, lineHeight: 14 }}>
                  Example rates as of {PRICING_AS_OF}, in USD per 1 million tokens; input and output are billed separately. Rates can change and may differ for your exact model, account, or hosting route.
                </Text>
                {PROVIDER_INFO.map((info) => (
                  <TouchableOpacity
                    key={info.key}
                    onPress={() => openPricing(info.pricingUrl)}
                    accessibilityRole="link"
                    style={{ paddingTop: 5 }}
                  >
                    <Text style={{ color: theme.primary, fontFamily: 'Inter_400Regular', fontSize: 9, lineHeight: 13 }}>
                      {info.label} · {info.model}: {info.inputPrice} input / {info.outputPrice} output · official rates
                    </Text>
                  </TouchableOpacity>
                ))}
                <Text style={{ color: theme.textMuted, fontFamily: 'Inter_400Regular', fontSize: 9, lineHeight: 13, marginTop: 5 }}>
                  Google's listed Gemini 3.8 Flash rate changes to $1.50 input / $7.50 output per 1M tokens on January 1, 2027.
                </Text>
              </View>

              <TouchableOpacity
                onPress={() => setUseGoogleSearch((enabled) => !enabled)}
                disabled={!searchAvailable}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: useGoogleSearch, disabled: !searchAvailable }}
                style={{ marginHorizontal: 16, marginTop: 7, flexDirection: 'row', alignItems: 'center', gap: 7, opacity: searchAvailable ? 1 : 0.55 }}
              >
                <Feather name={useGoogleSearch ? 'check-square' : 'square'} size={15} color={searchAvailable ? theme.primary : theme.textMuted} />
                <Text style={{ color: searchAvailable ? theme.text : theme.textMuted, fontFamily: 'Inter_600SemiBold', fontSize: 10 }}>
                  Use live Google Search grounding (Gemini only)
                </Text>
              </TouchableOpacity>
              <Text style={{ marginHorizontal: 16, marginTop: 3, color: theme.textMuted, fontFamily: 'Inter_400Regular', fontSize: 9, lineHeight: 13 }}>
                Search is separate from model tokens: Google lists 5,000 Gemini 3.x grounding requests/month shared across models, then $14 per 1,000 requests. Check Google's current terms and rates.
              </Text>
              <TouchableOpacity
                onPress={() => openPricing('https://ai.google.dev/gemini-api/docs/pricing')}
                accessibilityRole="link"
                style={{ marginHorizontal: 16, alignSelf: 'flex-start', paddingTop: 4 }}
              >
                <Text style={{ color: theme.primary, fontFamily: 'Inter_400Regular', fontSize: 9 }}>Google token and grounding prices</Text>
              </TouchableOpacity>
            </View>
          )}

          <ScrollView
            ref={scrollRef}
            style={{ flex: 1 }}
            contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 14 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator
          >
            {!messages.length ? (
              <View style={{ padding: 16, borderRadius: theme.radius, backgroundColor: theme.surface, borderWidth: 1, borderColor: theme.border }}>
                <Text style={{ color: theme.primary, fontFamily: 'Inter_700Bold', fontSize: 15, marginBottom: 7 }}>
                  {mode === 'help' ? 'Ask about using Middlemain' : 'Ask a general question'}
                </Text>
                <Text style={{ color: theme.textMuted, fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 18 }}>
                  {mode === 'help'
                    ? 'This built-in guide works offline and only answers from help content included in the app.'
                    : 'Choose a provider connection above, then ask. AI responses can be inaccurate; verify important information.'}
                </Text>
                {mode === 'help' ? (
                  <View style={{ gap: 7, marginTop: 13 }}>
                    {[
                      'How do I connect an AI provider?',
                      'How do I connect Memory Machine tools?',
                      'What can I use without a network?',
                    ].map((suggestion) => (
                      <TouchableOpacity
                        key={suggestion}
                        onPress={() => setQuestion(suggestion)}
                        accessibilityRole="button"
                        style={{ alignSelf: 'flex-start', borderRadius: 7, borderWidth: 1, borderColor: theme.border, paddingHorizontal: 10, paddingVertical: 7 }}
                      >
                        <Text style={{ color: theme.text, fontFamily: 'Inter_400Regular', fontSize: 11 }}>{suggestion}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                ) : null}
              </View>
            ) : (
              messages.map((message) => (
                <View
                  key={message.id}
                  style={{
                    alignSelf: message.role === 'user' ? 'flex-end' : 'flex-start',
                    maxWidth: '92%',
                    backgroundColor: message.role === 'user' ? theme.primary + '20' : theme.surface,
                    borderWidth: 1,
                    borderColor: message.role === 'user' ? theme.primary + '66' : theme.border,
                    borderRadius: 12,
                    padding: 11,
                    marginBottom: 10,
                  }}
                >
                  <Text style={{ color: message.role === 'user' ? theme.primary : theme.secondary, fontFamily: 'Inter_600SemiBold', fontSize: 9, letterSpacing: 1, marginBottom: 5 }}>
                    {message.role === 'user' ? 'YOU' : 'GUIDE'}
                  </Text>
                  <Text selectable style={{ color: theme.text, fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 18 }}>
                    {message.content || (isSending ? 'Thinking…' : '')}
                  </Text>
                  {message.sources?.length ? (
                    <View style={{ marginTop: 8, borderTopWidth: 1, borderTopColor: theme.border, paddingTop: 6 }}>
                      <Text style={{ color: theme.textMuted, fontFamily: 'Inter_600SemiBold', fontSize: 9, marginBottom: 3 }}>SOURCES</Text>
                      {message.sources.map((source) => (
                        <TouchableOpacity
                          key={source.uri}
                          onPress={() => openPricing(source.uri)}
                          accessibilityRole="link"
                          style={{ paddingVertical: 4 }}
                        >
                          <Text numberOfLines={2} style={{ color: theme.primary, fontFamily: 'Inter_400Regular', fontSize: 10 }}>
                            {source.title}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  ) : null}
                </View>
              ))
            )}
          </ScrollView>

          <View style={{ paddingHorizontal: 14, paddingTop: 8, paddingBottom: Math.max(insets.bottom, 10), borderTopWidth: 1, borderTopColor: theme.border, backgroundColor: theme.surface + 'EE' }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
              <TextInput
                value={question}
                onChangeText={setQuestion}
                placeholder={mode === 'help' ? 'Ask about Middlemain…' : 'Ask a question…'}
                placeholderTextColor={theme.textMuted}
                editable={!isSending}
                multiline
                maxLength={4000}
                returnKeyType="send"
                onSubmitEditing={handleSend}
                accessibilityLabel={mode === 'help' ? 'Question about Middlemain' : 'Question for the selected AI'}
                style={{
                  flex: 1,
                  maxHeight: 110,
                  minHeight: 42,
                  color: theme.text,
                  backgroundColor: theme.background,
                  borderWidth: 1,
                  borderColor: theme.border,
                  borderRadius: 10,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  fontFamily: 'Inter_400Regular',
                  fontSize: 12,
                }}
              />
              <TouchableOpacity
                onPress={handleSend}
                disabled={!question.trim() || isSending}
                accessibilityRole="button"
                accessibilityLabel="Send question"
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 10,
                  backgroundColor: question.trim() && !isSending ? theme.primary : theme.border,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {isSending
                  ? <Feather name="loader" size={16} color="#fff" />
                  : <Feather name="arrow-up" size={18} color="#fff" />}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </ThemedBackground>
  );
}
