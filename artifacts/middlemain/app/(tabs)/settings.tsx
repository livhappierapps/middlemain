import { Feather } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import React, { useEffect, useState } from 'react';
import {
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
import { NeonButton } from '@/components/NeonButton';
import { NeonCard } from '@/components/NeonCard';
import { NeonText } from '@/components/NeonText';
import { ThemedBackground } from '@/components/ThemedBackground';
import { ThemeSelector } from '@/components/ThemeSelector';
import { usePurchase } from '@/context/PurchaseContext';
import { useTheme } from '@/context/ThemeContext';
import { useCouncil } from '@/context/CouncilContext';

const APP_VERSION = '0.1.0 (Beta)';

const EXEC_KEY_STORAGE = '@middlemain_executive_key';

function getApiBase(): string {
  const domain = process.env.EXPO_PUBLIC_DOMAIN;
  if (domain) return `https://${domain}/api`;
  return '/api';
}

const EXEC_ENDPOINTS = [
  { method: 'POST', path: '/api/executive/chat', desc: 'Send a message to Leo' },
  { method: 'POST', path: '/api/executive/memory/search', desc: 'Search Leo\'s memory' },
  { method: 'POST', path: '/api/executive/memory/save', desc: 'Save a memory for Leo' },
];

function SectionHeader({ title }: { title: string }) {
  const { theme } = useTheme();
  return (
    <Text style={{ color: theme.textMuted, fontSize: 10, fontFamily: 'Inter_600SemiBold', letterSpacing: 2, marginBottom: 12, marginTop: 24, paddingHorizontal: 16 }}>
      {title}
    </Text>
  );
}

function SettingRow({ icon, label, value, onPress, accent }: { icon: string; label: string; value?: string; onPress?: () => void; accent?: string }) {
  const { theme } = useTheme();
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={!onPress}
      style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: theme.border, gap: 14 }}
    >
      <Feather name={icon as any} size={18} color={accent ?? theme.textMuted} />
      <Text style={{ flex: 1, color: theme.text, fontSize: 14, fontFamily: 'Inter_400Regular' }}>{label}</Text>
      {value ? <Text style={{ color: theme.textMuted, fontSize: 13, fontFamily: 'Inter_400Regular' }}>{value}</Text> : null}
      {onPress ? <Feather name="chevron-right" size={16} color={theme.textMuted} /> : null}
    </TouchableOpacity>
  );
}

function PricingCard({
  label,
  price,
  period,
  note,
  active,
  onPress,
  color,
}: {
  label: string;
  price: string;
  period: string;
  note?: string;
  active: boolean;
  onPress: () => void;
  color: string;
}) {
  const { theme } = useTheme();
  return (
    <TouchableOpacity
      onPress={onPress}
      style={{
        flex: 1,
        backgroundColor: theme.card + 'E6',
        borderRadius: theme.radius,
        borderWidth: active ? 2 : 1,
        borderColor: active ? color : theme.border,
        padding: 14,
        alignItems: 'center',
        shadowColor: active ? color : 'transparent',
        shadowOffset: { width: 0, height: 0 },
        shadowRadius: 10,
        shadowOpacity: active ? 0.6 : 0,
        elevation: active ? 6 : 1,
      }}
    >
      <Text style={{ color: theme.textMuted, fontSize: 10, fontFamily: 'Inter_600SemiBold', letterSpacing: 1.5 }}>{label}</Text>
      <Text style={{ color: color, fontSize: 22, fontFamily: 'Inter_700Bold', marginVertical: 4, textShadowColor: color, textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 8 }}>
        {price}
      </Text>
      <Text style={{ color: theme.textMuted, fontSize: 11, fontFamily: 'Inter_400Regular' }}>{period}</Text>
      {note && <Text style={{ color: color, fontSize: 10, fontFamily: 'Inter_600SemiBold', marginTop: 4 }}>{note}</Text>}
      {active && (
        <View style={{ marginTop: 8, backgroundColor: color + '22', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 4 }}>
          <Text style={{ color: color, fontSize: 9, fontFamily: 'Inter_700Bold', letterSpacing: 1 }}>CURRENT PLAN</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}

export default function SettingsScreen() {
  const { theme, themeKey } = useTheme();
  const { tier, hasRemovedAds, purchaseMonthly, purchaseAnnual, purchaseAdRemoval, restorePurchases } = usePurchase();
  const { webhookUrl, setWebhookUrl, testWebhook } = useCouncil();
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === 'web' ? 67 : insets.top;

  const [reportText, setReportText] = useState('');
  const [reportCategory, setReportCategory] = useState<'bug' | 'feature' | 'other'>('bug');
  const [reportSending, setReportSending] = useState(false);

  const [webhookInput, setWebhookInput] = useState(webhookUrl);
  const [webhookSaving, setWebhookSaving] = useState(false);
  const [webhookTesting, setWebhookTesting] = useState(false);

  // Executive API card
  const [execCardOpen, setExecCardOpen] = useState(false);
  const [execKey, setExecKey] = useState<string | null>(null);
  const [execKeyRevealed, setExecKeyRevealed] = useState(false);

  // XAI key updater
  const [xaiKeyInput, setXaiKeyInput] = useState('');
  const [xaiKeySaving, setXaiKeySaving] = useState(false);
  const [xaiKeyStatus, setXaiKeyStatus] = useState<'idle' | 'ok' | 'error'>('idle');

  useEffect(() => {
    AsyncStorage.getItem(EXEC_KEY_STORAGE).then((val) => {
      if (val) setExecKey(val);
    });
  }, []);

  const handlePurchaseMonthly = async () => {
    Alert.alert('Subscribe Monthly', 'Middlemain Pro — $3.99/month\n\nUnlimited AI bridge sessions, priority support, and all future features.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Subscribe', onPress: async () => {
          await purchaseMonthly();
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          Alert.alert('Welcome to Pro!', 'Thank you for supporting Middlemain.');
        },
      },
    ]);
  };

  const handlePurchaseAnnual = async () => {
    Alert.alert('Subscribe Annually', 'Middlemain Pro — $29.99/year\nSave 37% vs monthly.\n\nUnlimited AI bridge sessions, priority support, and all future features.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Subscribe', onPress: async () => {
          await purchaseAnnual();
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          Alert.alert('Welcome to Pro!', 'Thank you for supporting Middlemain.');
        },
      },
    ]);
  };

  const handleAdRemoval = async () => {
    Alert.alert('Remove Ads', 'Remove all ads for a one-time payment of $1.99.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove Ads — $1.99', onPress: async () => {
          await purchaseAdRemoval();
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          Alert.alert('Ads Removed!', 'Enjoy Middlemain ad-free.');
        },
      },
    ]);
  };

  const handleSaveXaiKey = async () => {
    if (!xaiKeyInput.trim()) {
      Alert.alert('Empty key', 'Paste your xAI API key first.');
      return;
    }
    if (!execKey) {
      Alert.alert('No executive key', 'Open the LEO EXECUTIVE API section and save your executive key first.');
      return;
    }
    setXaiKeySaving(true);
    setXaiKeyStatus('idle');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const resp = await fetch(`${getApiBase()}/executive/set-xai-key`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Executive-Key': execKey },
        body: JSON.stringify({ key: xaiKeyInput.trim() }),
      });
      if (resp.ok) {
        setXaiKeyStatus('ok');
        setXaiKeyInput('');
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert('✅ Key updated', 'xAI key is live on the server. AI Analyze and Leo chat will use it immediately.');
      } else {
        const json = await resp.json().catch(() => ({})) as any;
        setXaiKeyStatus('error');
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        Alert.alert('Failed', json?.error ?? `Server error ${resp.status}`);
      }
    } catch (err: any) {
      setXaiKeyStatus('error');
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('Failed', err?.message ?? 'Could not reach server');
    } finally {
      setXaiKeySaving(false);
    }
  };

  const handleSaveWebhook = async () => {
    setWebhookSaving(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    await setWebhookUrl(webhookInput.trim());
    setWebhookSaving(false);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert('Saved', webhookInput.trim() ? 'Webhook URL saved. The council will post digests here every 5 exchanges and after each auto session.' : 'Webhook URL cleared.');
  };

  const handleTestWebhook = async () => {
    if (!webhookInput.trim()) {
      Alert.alert('No URL', 'Enter a webhook URL first, then save it before testing.');
      return;
    }
    // Save first to ensure the URL is current
    await setWebhookUrl(webhookInput.trim());
    setWebhookTesting(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const result = await testWebhook();
    setWebhookTesting(false);
    if (result.ok) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('✅ Webhook reachable', 'Test digest was accepted by your URL. Leo can now receive council updates.');
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      Alert.alert('⚠️ Webhook failed', result.error ?? 'Could not reach the URL. Check it is correct and publicly accessible.');
    }
  };

  const handleSendReport = async () => {
    if (!reportText.trim()) {
      Alert.alert('Empty Report', 'Please describe the issue or feedback you would like to share.');
      return;
    }
    setReportSending(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    // Simulate sending
    await new Promise((r) => setTimeout(r, 1200));
    setReportSending(false);
    setReportText('');
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert('Report Sent', 'Thank you! Your feedback helps make Middlemain better. No personal information was transmitted.');
  };

  return (
    <ThemedBackground>
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingTop: topInset + 16, paddingBottom: Platform.OS === 'web' ? 34 : 20 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ paddingHorizontal: 16, marginBottom: 20 }}>
          <NeonText size={20} weight="700" letterSpacing={3}>SETTINGS</NeonText>
        </View>

        {/* Themes */}
        <SectionHeader title="APPEARANCE" />
        <View style={{ marginBottom: 8 }}>
          <Text style={{ color: theme.text, fontSize: 14, fontFamily: 'Inter_500Medium', paddingHorizontal: 16, marginBottom: 16 }}>
            Theme: {theme.displayName}
          </Text>
          <ThemeSelector />
        </View>

        {/* Subscription */}
        <SectionHeader title="SUBSCRIPTION" />
        <View style={{ paddingHorizontal: 16 }}>
          <View style={{ flexDirection: 'row', gap: 10, marginBottom: 12 }}>
            <PricingCard
              label="MONTHLY"
              price="$3.99"
              period="per month"
              active={tier === 'monthly'}
              onPress={handlePurchaseMonthly}
              color={theme.primary}
            />
            <PricingCard
              label="ANNUAL"
              price="$29.99"
              period="per year"
              note="Save 37%"
              active={tier === 'annual'}
              onPress={handlePurchaseAnnual}
              color={theme.secondary}
            />
          </View>
          {!hasRemovedAds && (
            <TouchableOpacity
              onPress={handleAdRemoval}
              style={{ backgroundColor: theme.card + 'E6', borderRadius: theme.radius, borderWidth: 1, borderColor: theme.border, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 }}
            >
              <Feather name="x-circle" size={20} color={theme.accent} />
              <View style={{ flex: 1 }}>
                <Text style={{ color: theme.text, fontSize: 14, fontFamily: 'Inter_500Medium' }}>Remove Ads</Text>
                <Text style={{ color: theme.textMuted, fontSize: 12, fontFamily: 'Inter_400Regular' }}>One-time · $1.99</Text>
              </View>
              <Text style={{ color: theme.accent, fontSize: 13, fontFamily: 'Inter_600SemiBold', textShadowColor: theme.accent, textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 6 }}>
                BUY
              </Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={restorePurchases}>
            <Text style={{ color: theme.textMuted, fontSize: 12, fontFamily: 'Inter_400Regular', textAlign: 'center', textDecorationLine: 'underline' }}>
              Restore Purchases
            </Text>
          </TouchableOpacity>
        </View>

        {/* Executive Webhook */}
        <SectionHeader title="EXECUTIVE WEBHOOK" />
        <NeonCard style={{ marginHorizontal: 16, marginBottom: 4 }} accentColor={theme.accent}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <Feather name="radio" size={18} color={theme.accent} />
            <NeonText size={14} weight="600" color={theme.accent} glow>
              Leo's Inbound Webhook
            </NeonText>
          </View>
          <Text style={{ color: theme.textMuted, fontSize: 12, fontFamily: 'Inter_400Regular', marginBottom: 14, lineHeight: 18 }}>
            The council will POST a digest to this URL every 5 exchanges and after each auto session ends — letting Leo monitor and join from outside.
          </Text>

          <Text style={{ color: theme.textMuted, fontSize: 10, fontFamily: 'Inter_600SemiBold', letterSpacing: 1.5, marginBottom: 6 }}>
            WEBHOOK URL
          </Text>
          <TextInput
            style={{
              backgroundColor: theme.surface + 'E6',
              borderWidth: 1,
              borderColor: theme.border,
              borderRadius: theme.radius,
              color: theme.text,
              fontSize: 13,
              fontFamily: 'Inter_400Regular',
              paddingHorizontal: 14,
              paddingVertical: 12,
              marginBottom: 12,
            }}
            value={webhookInput}
            onChangeText={setWebhookInput}
            placeholder="https://your-domain.com/api/executive/webhook/council"
            placeholderTextColor={theme.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />

          <Text style={{ color: theme.textMuted, fontSize: 11, fontFamily: 'Inter_400Regular', marginBottom: 14, lineHeight: 16 }}>
            💡 Use your API server's{' '}
            <Text style={{ color: theme.accent, fontFamily: 'Inter_600SemiBold' }}>
              /api/executive/webhook/council
            </Text>
            {' '}endpoint as the URL, or any URL Leo controls.
          </Text>

          <View style={{ flexDirection: 'row', gap: 10 }}>
            <NeonButton
              label="Save"
              onPress={handleSaveWebhook}
              loading={webhookSaving}
              variant="primary"
              style={{ flex: 1 }}
              fullWidth
            />
            <NeonButton
              label="Send Test"
              onPress={handleTestWebhook}
              loading={webhookTesting}
              variant="secondary"
              style={{ flex: 1 }}
              fullWidth
            />
          </View>
        </NeonCard>

        {/* Executive API */}
        <TouchableOpacity
          onPress={() => { setExecCardOpen((o) => !o); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
          style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, marginTop: 24, marginBottom: 12, gap: 8 }}
          activeOpacity={0.7}
        >
          <Text style={{ flex: 1, color: theme.textMuted, fontSize: 10, fontFamily: 'Inter_600SemiBold', letterSpacing: 2 }}>
            LEO EXECUTIVE API
          </Text>
          <Feather name={execCardOpen ? 'chevron-up' : 'chevron-down'} size={14} color={theme.textMuted} />
        </TouchableOpacity>

        {execCardOpen && (
          <NeonCard style={{ marginHorizontal: 16, marginBottom: 4 }} accentColor={theme.primary}>
            {/* Header */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <Feather name="terminal" size={18} color={theme.primary} />
              <NeonText size={14} weight="600" color={theme.primary} glow>
                Leo Executive API
              </NeonText>
            </View>
            <Text style={{ color: theme.textMuted, fontSize: 12, fontFamily: 'Inter_400Regular', marginBottom: 16, lineHeight: 18 }}>
              Call Leo's Executive API from outside Middlemain. Include the{' '}
              <Text style={{ color: theme.primary, fontFamily: 'Inter_600SemiBold' }}>X-Executive-Key</Text>
              {' '}header on every request.
            </Text>

            {/* Base URL */}
            <Text style={{ color: theme.textMuted, fontSize: 10, fontFamily: 'Inter_600SemiBold', letterSpacing: 1.5, marginBottom: 6 }}>
              BASE URL
            </Text>
            <TouchableOpacity
              onPress={async () => {
                const base = getApiBase();
                await Clipboard.setStringAsync(base);
                Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                Alert.alert('Copied', base);
              }}
              style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: theme.surface + 'E6', borderWidth: 1, borderColor: theme.border, borderRadius: theme.radius, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 16, gap: 10 }}
              activeOpacity={0.7}
            >
              <Text style={{ flex: 1, color: theme.text, fontSize: 12, fontFamily: 'Inter_400Regular' }} numberOfLines={1}>
                {getApiBase()}
              </Text>
              <Feather name="copy" size={14} color={theme.textMuted} />
            </TouchableOpacity>

            {/* Endpoints */}
            <Text style={{ color: theme.textMuted, fontSize: 10, fontFamily: 'Inter_600SemiBold', letterSpacing: 1.5, marginBottom: 8 }}>
              ENDPOINTS
            </Text>
            {EXEC_ENDPOINTS.map((ep) => {
              const full = `${getApiBase()}${ep.path.replace(/^\/api/, '')}`;
              return (
                <TouchableOpacity
                  key={ep.path}
                  onPress={async () => {
                    await Clipboard.setStringAsync(full);
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                    Alert.alert('Copied', full);
                  }}
                  style={{ flexDirection: 'row', alignItems: 'flex-start', backgroundColor: theme.surface + 'E6', borderWidth: 1, borderColor: theme.border, borderRadius: theme.radius, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 8, gap: 10 }}
                  activeOpacity={0.7}
                >
                  <View style={{ backgroundColor: theme.primary + '22', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, marginTop: 1 }}>
                    <Text style={{ color: theme.primary, fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 0.5 }}>{ep.method}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: theme.text, fontSize: 12, fontFamily: 'Inter_400Regular' }}>{ep.path}</Text>
                    <Text style={{ color: theme.textMuted, fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: 2 }}>{ep.desc}</Text>
                  </View>
                  <Feather name="copy" size={13} color={theme.textMuted} style={{ marginTop: 2 }} />
                </TouchableOpacity>
              );
            })}

            {/* Auth header */}
            <Text style={{ color: theme.textMuted, fontSize: 10, fontFamily: 'Inter_600SemiBold', letterSpacing: 1.5, marginTop: 8, marginBottom: 8 }}>
              AUTHENTICATION
            </Text>
            <View style={{ backgroundColor: theme.surface + 'E6', borderWidth: 1, borderColor: theme.border, borderRadius: theme.radius, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 16 }}>
              <Text style={{ color: theme.textMuted, fontSize: 11, fontFamily: 'Inter_400Regular', marginBottom: 2 }}>Header</Text>
              <Text style={{ color: theme.text, fontSize: 12, fontFamily: 'Inter_400Regular' }}>
                <Text style={{ color: theme.primary, fontFamily: 'Inter_600SemiBold' }}>X-Executive-Key</Text>
                {': '}
                <Text style={{ color: theme.textMuted }}>&lt;your-key&gt;</Text>
              </Text>
            </View>

            {/* Key */}
            <Text style={{ color: theme.textMuted, fontSize: 10, fontFamily: 'Inter_600SemiBold', letterSpacing: 1.5, marginBottom: 8 }}>
              YOUR KEY
            </Text>
            {execKey ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: theme.surface + 'E6', borderWidth: 1, borderColor: theme.border, borderRadius: theme.radius, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 6, gap: 10 }}>
                <Text style={{ flex: 1, color: theme.text, fontSize: 12, fontFamily: 'Inter_400Regular', letterSpacing: execKeyRevealed ? 0.5 : 2 }} numberOfLines={1}>
                  {execKeyRevealed ? execKey : '•'.repeat(Math.min(execKey.length, 24))}
                </Text>
                <TouchableOpacity onPress={() => { setExecKeyRevealed((r) => !r); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <Feather name={execKeyRevealed ? 'eye-off' : 'eye'} size={15} color={theme.textMuted} />
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={async () => {
                    await Clipboard.setStringAsync(execKey);
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                    Alert.alert('Copied', 'Executive key copied to clipboard.');
                  }}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Feather name="copy" size={15} color={theme.textMuted} />
                </TouchableOpacity>
              </View>
            ) : (
              <View style={{ backgroundColor: theme.surface + 'E6', borderWidth: 1, borderColor: theme.border, borderRadius: theme.radius, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 6 }}>
                <Text style={{ color: theme.textMuted, fontSize: 12, fontFamily: 'Inter_400Regular', lineHeight: 18 }}>
                  No key saved on this device.{'\n'}
                  <Text style={{ fontSize: 11 }}>Set{' '}
                    <Text style={{ color: theme.primary, fontFamily: 'Inter_600SemiBold' }}>LEO_EXECUTIVE_KEY</Text>
                    {' '}on the API server, then add the key below.
                  </Text>
                </Text>
                <TextInput
                  style={{ marginTop: 10, backgroundColor: 'transparent', borderWidth: 1, borderColor: theme.border, borderRadius: 6, color: theme.text, fontSize: 12, fontFamily: 'Inter_400Regular', paddingHorizontal: 10, paddingVertical: 8 }}
                  placeholder="Paste key to save locally…"
                  placeholderTextColor={theme.textMuted}
                  autoCapitalize="none"
                  autoCorrect={false}
                  secureTextEntry
                  onSubmitEditing={async (e) => {
                    const val = e.nativeEvent.text.trim();
                    if (val) {
                      await AsyncStorage.setItem(EXEC_KEY_STORAGE, val);
                      setExecKey(val);
                      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                    }
                  }}
                  returnKeyType="done"
                />
              </View>
            )}
            <Text style={{ color: theme.textMuted, fontSize: 11, fontFamily: 'Inter_400Regular', lineHeight: 16 }}>
              💡 The key is stored locally on this device only and is never transmitted to our servers.
            </Text>

            {/* ── XAI / Grok key updater ── */}
            <View style={{ marginTop: 20, borderTopWidth: 1, borderTopColor: theme.border, paddingTop: 16 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <Feather name="zap" size={14} color="#f59e0b" />
                <Text style={{ color: theme.textMuted, fontSize: 10, fontFamily: 'Inter_600SemiBold', letterSpacing: 1.5, flex: 1 }}>
                  XAI / GROK API KEY
                </Text>
                {xaiKeyStatus === 'ok' && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#34d399' }} />
                    <Text style={{ color: '#34d399', fontSize: 10, fontFamily: 'Inter_600SemiBold' }}>LIVE</Text>
                  </View>
                )}
                {xaiKeyStatus === 'error' && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#ff6b6b' }} />
                    <Text style={{ color: '#ff6b6b', fontSize: 10, fontFamily: 'Inter_600SemiBold' }}>FAILED</Text>
                  </View>
                )}
              </View>
              <Text style={{ color: theme.textMuted, fontSize: 11, fontFamily: 'Inter_400Regular', lineHeight: 16, marginBottom: 10 }}>
                Paste a fresh key from{' '}
                <Text style={{ color: '#f59e0b', fontFamily: 'Inter_600SemiBold' }}>console.x.ai</Text>
                {' '}to update the server without a restart.
              </Text>
              <TextInput
                style={{
                  backgroundColor: theme.surface + 'E6',
                  borderWidth: 1,
                  borderColor: xaiKeyStatus === 'error' ? '#ff6b6b' : xaiKeyStatus === 'ok' ? '#34d399' : theme.border,
                  borderRadius: theme.radius,
                  color: theme.text,
                  fontSize: 13,
                  fontFamily: 'Inter_400Regular',
                  paddingHorizontal: 14,
                  paddingVertical: 10,
                  marginBottom: 10,
                }}
                value={xaiKeyInput}
                onChangeText={(t) => { setXaiKeyInput(t); setXaiKeyStatus('idle'); }}
                placeholder="xai-…"
                placeholderTextColor={theme.textMuted}
                autoCapitalize="none"
                autoCorrect={false}
                secureTextEntry
              />
              <NeonButton
                label={xaiKeySaving ? 'Updating…' : 'Update Grok Key'}
                onPress={handleSaveXaiKey}
                loading={xaiKeySaving}
                variant="primary"
                fullWidth
              />
            </View>
          </NeonCard>
        )}

        {/* REPORT SECTION — highly visible */}
        <SectionHeader title="REPORT A PROBLEM" />
        <NeonCard style={{ marginHorizontal: 16, marginBottom: 4 }} accentColor={theme.secondary}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <Feather name="alert-circle" size={18} color={theme.secondary} />
            <NeonText size={14} weight="600" color={theme.secondary} glow>
              Send Feedback or Bug Report
            </NeonText>
          </View>
          <Text style={{ color: theme.textMuted, fontSize: 12, fontFamily: 'Inter_400Regular', marginBottom: 14, lineHeight: 18 }}>
            Help improve Middlemain. No personal information is collected — only the content of this report.
          </Text>

          {/* Category */}
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
            {(['bug', 'feature', 'other'] as const).map((cat) => (
              <TouchableOpacity
                key={cat}
                onPress={() => setReportCategory(cat)}
                style={{
                  flex: 1,
                  paddingVertical: 8,
                  borderRadius: 6,
                  borderWidth: 1,
                  borderColor: reportCategory === cat ? theme.secondary : theme.border,
                  backgroundColor: reportCategory === cat ? theme.secondary + '22' : 'transparent',
                  alignItems: 'center',
                }}
              >
                <Text style={{ color: reportCategory === cat ? theme.secondary : theme.textMuted, fontSize: 11, fontFamily: 'Inter_600SemiBold', letterSpacing: 1 }}>
                  {cat.toUpperCase()}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <TextInput
            style={{
              backgroundColor: theme.surface + 'E6',
              borderWidth: 1,
              borderColor: reportText.length > 900 ? theme.destructive : theme.border,
              borderRadius: theme.radius,
              color: theme.text,
              fontSize: 13,
              fontFamily: 'Inter_400Regular',
              paddingHorizontal: 14,
              paddingVertical: 12,
              minHeight: 120,
              textAlignVertical: 'top',
              marginBottom: 6,
            }}
            value={reportText}
            onChangeText={(t) => setReportText(t.slice(0, 1000))}
            placeholder="Describe the issue or feature request (optional — up to 1000 characters)..."
            placeholderTextColor={theme.textMuted}
            multiline
          />
          <Text style={{ color: reportText.length > 900 ? theme.destructive : theme.textMuted, fontSize: 10, fontFamily: 'Inter_400Regular', textAlign: 'right', marginBottom: 14 }}>
            {reportText.length}/1000
          </Text>

          <NeonButton
            label="Send Report"
            onPress={handleSendReport}
            loading={reportSending}
            variant="secondary"
            fullWidth
          />
        </NeonCard>

        {/* Legal & Info */}
        <SectionHeader title="LEGAL & INFO" />
        <View style={{ backgroundColor: theme.surface + 'E6', marginHorizontal: 16, borderRadius: theme.radius, overflow: 'hidden', borderWidth: 1, borderColor: theme.border }}>
          <SettingRow icon="globe" label="Middlemain on the Web" onPress={() => WebBrowser.openBrowserAsync('https://livhappierapps.com/apps/middlemain')} accent={theme.accent} />
          <SettingRow icon="shield" label="Privacy Policy" onPress={() => WebBrowser.openBrowserAsync('https://livhappierapps.com/apps/middlemain/privacy')} accent={theme.primary} />
          <SettingRow icon="file-text" label="Terms & Conditions" onPress={() => WebBrowser.openBrowserAsync('https://livhappierapps.com/apps/middlemain/terms')} accent={theme.primary} />
          <SettingRow icon="info" label="App Version" value={APP_VERSION} />
          <SettingRow icon="code" label="Open Source" value="MIT License" />
        </View>

        <View style={{ paddingHorizontal: 16, marginTop: 24, paddingBottom: 10 }}>
          <Text style={{ color: theme.textMuted, fontSize: 11, fontFamily: 'Inter_400Regular', textAlign: 'center', lineHeight: 18 }}>
            Middlemain is an independent developer tool in beta.{'\n'}
            Your API keys are stored locally and never transmitted to our servers.{'\n'}
            Payments processed by Apple In-App Purchase.
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
    </ThemedBackground>
  );
}
