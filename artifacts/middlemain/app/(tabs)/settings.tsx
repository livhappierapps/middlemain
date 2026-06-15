import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import React, { useState } from 'react';
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
import { ThemeSelector } from '@/components/ThemeSelector';
import { usePurchase } from '@/context/PurchaseContext';
import { useTheme } from '@/context/ThemeContext';

const APP_VERSION = '0.1.0 (Beta)';

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
        backgroundColor: theme.card,
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
  const insets = useSafeAreaInsets();
  const topInset = Platform.OS === 'web' ? 67 : insets.top;

  const [reportText, setReportText] = useState('');
  const [reportCategory, setReportCategory] = useState<'bug' | 'feature' | 'other'>('bug');
  const [reportSending, setReportSending] = useState(false);

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
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: theme.background }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
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
              style={{ backgroundColor: theme.card, borderRadius: theme.radius, borderWidth: 1, borderColor: theme.border, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 }}
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
              backgroundColor: theme.surface,
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
        <View style={{ backgroundColor: theme.surface, marginHorizontal: 16, borderRadius: theme.radius, overflow: 'hidden', borderWidth: 1, borderColor: theme.border }}>
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
  );
}
