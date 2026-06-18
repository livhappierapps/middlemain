import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import React, { useState } from 'react';
import {
  Alert,
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
import { AisAndEarsBridgeCard } from '@/components/AisAndEarsBridgeCard';
import { ConnectionCard } from '@/components/ConnectionCard';
import { NeonButton } from '@/components/NeonButton';
import { NeonText } from '@/components/NeonText';
import { AIConnection, AIProvider, PROVIDER_DEFAULTS, useAI } from '@/context/AIContext';
import { useTheme } from '@/context/ThemeContext';
import { ThemedBackground } from '@/components/ThemedBackground';

const PROVIDERS: { key: AIProvider; label: string }[] = [
  { key: 'xai', label: 'Grok (xAI)' },
  { key: 'openai', label: 'OpenAI' },
  { key: 'anthropic', label: 'Anthropic' },
  { key: 'custom', label: 'Custom' },
];

function ConnectionForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: Partial<AIConnection>;
  onSave: (data: Omit<AIConnection, 'id'>) => void;
  onCancel: () => void;
}) {
  const { theme } = useTheme();
  const [name, setName] = useState(initial?.name ?? '');
  const [provider, setProvider] = useState<AIProvider>(initial?.provider ?? 'xai');
  const [apiKey, setApiKey] = useState(initial?.apiKey ?? '');
  const [model, setModel] = useState(initial?.model ?? PROVIDER_DEFAULTS['xai'].model);
  const [baseUrl, setBaseUrl] = useState(initial?.baseUrl ?? '');
  const [systemPrompt, setSystemPrompt] = useState(initial?.systemPrompt ?? 'You are a helpful AI development assistant.');

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

  const handleProviderSelect = (p: AIProvider) => {
    setProvider(p);
    setModel(PROVIDER_DEFAULTS[p].model);
    setBaseUrl(PROVIDER_DEFAULTS[p].baseUrl);
  };

  const handleSave = () => {
    if (!name.trim()) { Alert.alert('Required', 'Please enter a connection name.'); return; }
    if (!apiKey.trim()) { Alert.alert('Required', 'Please enter an API key.'); return; }
    if (!model.trim()) { Alert.alert('Required', 'Please enter a model name.'); return; }
    onSave({
      name: name.trim(),
      provider,
      apiKey: apiKey.trim(),
      model: model.trim(),
      baseUrl: baseUrl.trim() || PROVIDER_DEFAULTS[provider].baseUrl,
      systemPrompt: systemPrompt.trim(),
      isActive: initial?.isActive ?? false,
      testStatus: 'untested',
    });
  };

  return (
    <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
      <Text style={labelStyle}>CONNECTION NAME</Text>
      <TextInput
        style={inputStyle}
        value={name}
        onChangeText={setName}
        placeholder="My Grok Connection"
        placeholderTextColor={theme.textMuted}
      />

      <Text style={labelStyle}>PROVIDER</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
        {PROVIDERS.map((p) => (
          <TouchableOpacity
            key={p.key}
            onPress={() => handleProviderSelect(p.key)}
            style={{
              paddingHorizontal: 14,
              paddingVertical: 8,
              borderRadius: theme.radius,
              borderWidth: 1,
              borderColor: provider === p.key ? theme.primary : theme.border,
              backgroundColor: provider === p.key ? theme.primary + '22' : 'transparent',
            }}
          >
            <Text style={{ color: provider === p.key ? theme.primary : theme.textMuted, fontSize: 12, fontFamily: 'Inter_600SemiBold' }}>
              {p.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={labelStyle}>API KEY</Text>
      <TextInput
        style={inputStyle}
        value={apiKey}
        onChangeText={setApiKey}
        placeholder="xai-..."
        placeholderTextColor={theme.textMuted}
        secureTextEntry
        autoCapitalize="none"
        autoCorrect={false}
      />

      <Text style={labelStyle}>MODEL</Text>
      <TextInput
        style={inputStyle}
        value={model}
        onChangeText={setModel}
        placeholder="grok-3"
        placeholderTextColor={theme.textMuted}
        autoCapitalize="none"
        autoCorrect={false}
      />

      {provider === 'custom' && (
        <>
          <Text style={labelStyle}>BASE URL</Text>
          <TextInput
            style={inputStyle}
            value={baseUrl}
            onChangeText={setBaseUrl}
            placeholder="https://api.example.com/v1"
            placeholderTextColor={theme.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />
        </>
      )}

      <Text style={labelStyle}>SYSTEM PROMPT</Text>
      <TextInput
        style={[inputStyle, { height: 90, textAlignVertical: 'top', paddingTop: 12 }]}
        value={systemPrompt}
        onChangeText={setSystemPrompt}
        placeholder="You are a helpful AI development assistant."
        placeholderTextColor={theme.textMuted}
        multiline
      />

      <View style={{ flexDirection: 'row', gap: 10, marginTop: 24, marginBottom: 20 }}>
        <NeonButton label="Cancel" onPress={onCancel} variant="ghost" style={{ flex: 1 }} fullWidth />
        <NeonButton label="Save" onPress={handleSave} variant="primary" style={{ flex: 1 }} fullWidth />
      </View>
    </ScrollView>
  );
}

export default function ConnectionsScreen() {
  const { theme } = useTheme();
  const { connections, addConnection, updateConnection, deleteConnection, testConnection, serverGrokAvailable, addServerGrokConnection } = useAI();
  const insets = useSafeAreaInsets();
  const [showForm, setShowForm] = useState(false);
  const [editTarget, setEditTarget] = useState<AIConnection | null>(null);
  const [testingId, setTestingId] = useState<string | null>(null);
  const topInset = Platform.OS === 'web' ? 67 : insets.top;

  const handleEdit = (conn: AIConnection) => {
    setEditTarget(conn);
    setShowForm(true);
  };

  const handleTest = async (id: string) => {
    setTestingId(id);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const ok = await testConnection(id);
    setTestingId(null);
    Haptics.notificationAsync(ok ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error);
    Alert.alert(ok ? 'Connection OK' : 'Connection Failed', ok ? 'AI responded successfully.' : 'Check your API key and model name.');
  };

  const handleSave = (data: Omit<AIConnection, 'id'>) => {
    if (editTarget) {
      updateConnection(editTarget.id, data);
    } else {
      addConnection(data);
    }
    setShowForm(false);
    setEditTarget(null);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  };

  const handleDeletePrompt = (conn: AIConnection) => {
    Alert.alert('Delete Connection', `Remove "${conn.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteConnection(conn.id) },
    ]);
  };

  if (showForm) {
    return (
      <ThemedBackground>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={{ flex: 1, padding: 16, paddingTop: topInset + 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 20 }}>
            <TouchableOpacity onPress={() => { setShowForm(false); setEditTarget(null); }} style={{ marginRight: 14 }}>
              <Feather name="arrow-left" size={22} color={theme.primary} />
            </TouchableOpacity>
            <NeonText size={18} weight="700" letterSpacing={3}>
              {editTarget ? 'EDIT CONNECTION' : 'NEW CONNECTION'}
            </NeonText>
          </View>
          <ConnectionForm
            initial={editTarget ?? undefined}
            onSave={handleSave}
            onCancel={() => { setShowForm(false); setEditTarget(null); }}
          />
        </View>
      </KeyboardAvoidingView>
      </ThemedBackground>
    );
  }

  return (
    <ThemedBackground>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingTop: topInset + 16, paddingBottom: Platform.OS === 'web' ? 34 : 20 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, marginBottom: 20 }}>
          <NeonText size={20} weight="700" letterSpacing={3}>CONNECTIONS</NeonText>
          <TouchableOpacity
            onPress={() => { setShowForm(true); setEditTarget(null); }}
            style={{ width: 36, height: 36, borderRadius: 18, borderWidth: 1.5, borderColor: theme.primary, alignItems: 'center', justifyContent: 'center', shadowColor: theme.primary, shadowOffset: { width: 0, height: 0 }, shadowRadius: 8, shadowOpacity: 0.6 }}
          >
            <Feather name="plus" size={20} color={theme.primary} />
          </TouchableOpacity>
        </View>

        {/* AIs & Ears Bridge */}
        <View style={{ paddingTop: 4 }}>
          <Text style={{ color: theme.textMuted, fontSize: 10, fontFamily: 'Inter_600SemiBold', letterSpacing: 1.5, paddingHorizontal: 16, marginBottom: 10 }}>
            SENSORY BRIDGE
          </Text>
          <AisAndEarsBridgeCard />
        </View>

        {/* Divider */}
        <View style={{ marginHorizontal: 16, marginBottom: 16, borderTopWidth: 1, borderTopColor: theme.border }} />
        <Text style={{ color: theme.textMuted, fontSize: 10, fontFamily: 'Inter_600SemiBold', letterSpacing: 1.5, paddingHorizontal: 16, marginBottom: 10 }}>
          AI CONNECTIONS
        </Text>

        {/* Server Grok quick-setup */}
        {serverGrokAvailable && !connections.some((c) => c.provider === 'server') && (
          <TouchableOpacity
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              addServerGrokConnection();
            }}
            style={{
              marginHorizontal: 16,
              marginBottom: 14,
              backgroundColor: theme.secondary + '18',
              borderWidth: 1.5,
              borderColor: theme.secondary,
              borderRadius: theme.radius,
              padding: 14,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
              shadowColor: theme.secondary,
              shadowOffset: { width: 0, height: 0 },
              shadowRadius: 10,
              shadowOpacity: 0.4,
              elevation: 5,
            }}
          >
            <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: theme.secondary + '30', alignItems: 'center', justifyContent: 'center' }}>
              <Feather name="zap" size={20} color={theme.secondary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.secondary, fontSize: 14, fontFamily: 'Inter_600SemiBold', textShadowColor: theme.secondary, textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 6 }}>
                Quick Connect — Dev's Grok
              </Text>
              <Text style={{ color: theme.textMuted, fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 3 }}>
                Server API key detected · Tap to add instantly
              </Text>
            </View>
            <Feather name="plus-circle" size={22} color={theme.secondary} />
          </TouchableOpacity>
        )}

        {connections.length === 0 ? (
          <View style={{ alignItems: 'center', paddingVertical: 60, paddingHorizontal: 32 }}>
            <Feather name="link" size={48} color={theme.border} style={{ marginBottom: 16 }} />
            <NeonText size={15} weight="600" glow={false} style={{ textAlign: 'center', color: theme.textMuted } as any}>
              No AI connections yet
            </NeonText>
            <Text style={{ color: theme.textMuted, fontSize: 13, fontFamily: 'Inter_400Regular', textAlign: 'center', marginTop: 8, lineHeight: 20 }}>
              Add your Grok API key or any other AI provider to get started.
            </Text>
            <NeonButton label="Add First Connection" onPress={() => setShowForm(true)} style={{ marginTop: 24 }} />
          </View>
        ) : (
          connections.map((conn) => (
            <View key={conn.id}>
              <ConnectionCard
                connection={conn}
                onEdit={handleEdit}
                onTest={handleTest}
                testing={testingId === conn.id}
              />
            </View>
          ))
        )}

        <View style={{ paddingHorizontal: 16, marginTop: 20 }}>
          <Text style={{ color: theme.textMuted, fontSize: 11, fontFamily: 'Inter_400Regular', lineHeight: 18, textAlign: 'center' }}>
            API keys are stored locally on your device and never sent to Middlemain servers.
          </Text>
        </View>
      </ScrollView>
      <AdBanner onUpgradePress={() => router.push('/(tabs)/settings')} />
    </ThemedBackground>
  );
}
