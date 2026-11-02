import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import React, { useState } from 'react';
import { ActivityIndicator, Platform, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  AUTO_RENEW_DISCLOSURE,
  PRICE_CHANGE_DISCLAIMER,
  PRIVACY_POLICY_URL,
  REMOVE_ADS_SKU,
  SUBSCRIPTION_PLANS,
  SubscriptionPlanId,
  TERMS_OF_USE_URL,
  THEME_EXPANSION_SKU,
} from '@/constants/products';
import { EXPANSION_THEME_KEYS } from '@/constants/themes';
import { PENDING_APPROVAL_MESSAGE, usePurchase } from '@/context/PurchaseContext';
import { useTheme } from '@/context/ThemeContext';

const PRO_BENEFITS = [
  'Ad-free across the whole app',
  'PRO badge and every Pro feature as it ships',
  'Supports ongoing development of Middlemain',
];

export default function PaywallScreen() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const {
    tier, isPro, hasRemovedAds, hasThemeExpansion, busySku, pendingApprovalSku, priceFor,
    purchaseSubscription, purchaseAdRemoval, purchaseThemeExpansion, restorePurchases, manageSubscriptions,
  } = usePurchase();
  const [selected, setSelected] = useState<SubscriptionPlanId>('yearly');
  const topInset = Platform.OS === 'web' ? 67 : insets.top;
  const selectedPlan = SUBSCRIPTION_PLANS.find((p) => p.id === selected)!;
  const busy = busySku !== null;
  const themePackReady = EXPANSION_THEME_KEYS.length > 0;

  const subscribe = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    await purchaseSubscription(selected);
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.background }}>
      <View style={{ paddingTop: topInset + 10, paddingHorizontal: 16, paddingBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 1, borderBottomColor: theme.border, backgroundColor: theme.surface }}>
        <TouchableOpacity onPress={() => router.back()} accessibilityLabel="Close">
          <Feather name="x" size={22} color={theme.primary} />
        </TouchableOpacity>
        <Text style={{ color: theme.text, fontSize: 16, fontFamily: 'Inter_600SemiBold' }}>Middlemain Pro</Text>
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 30 }} showsVerticalScrollIndicator={false}>
        <Text style={{ color: theme.primary, fontSize: 24, fontFamily: 'Inter_700Bold', textAlign: 'center', letterSpacing: 3, textShadowColor: theme.primary, textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 10, marginTop: 8 }}>
          GO PRO
        </Text>
        <View style={{ marginTop: 14, marginBottom: 18, gap: 8 }}>
          {PRO_BENEFITS.map((b) => (
            <View key={b} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Feather name="check-circle" size={16} color={theme.secondary} />
              <Text style={{ color: theme.text, fontSize: 14, fontFamily: 'Inter_400Regular', flex: 1 }}>{b}</Text>
            </View>
          ))}
        </View>

        {pendingApprovalSku && (
          <View accessibilityLiveRegion="polite" style={{ flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: theme.secondary, borderRadius: theme.radius, padding: 12, marginBottom: 14, backgroundColor: theme.secondary + '18' }}>
            <Feather name="clock" size={16} color={theme.secondary} />
            <Text style={{ color: theme.text, fontSize: 13, fontFamily: 'Inter_400Regular', flex: 1 }}>{PENDING_APPROVAL_MESSAGE}</Text>
          </View>
        )}

        {isPro && (
          <View style={{ borderWidth: 1, borderColor: theme.primary, borderRadius: theme.radius, padding: 12, marginBottom: 14, backgroundColor: theme.primary + '18' }}>
            <Text style={{ color: theme.primary, fontSize: 13, fontFamily: 'Inter_600SemiBold', textAlign: 'center' }}>
              You're on Pro ({SUBSCRIPTION_PLANS.find((p) => p.id === tier)?.label.toLowerCase()}). Thank you!
            </Text>
          </View>
        )}

        <View style={{ gap: 10 }}>
          {SUBSCRIPTION_PLANS.map((plan) => {
            const isSel = plan.id === selected;
            const isCurrent = plan.id === tier;
            return (
              <TouchableOpacity
                key={plan.id}
                onPress={() => setSelected(plan.id)}
                accessibilityRole="radio"
                accessibilityState={{ selected: isSel }}
                style={{ flexDirection: 'row', alignItems: 'center', padding: 14, borderRadius: theme.radius, borderWidth: isSel ? 2 : 1, borderColor: isSel ? theme.primary : theme.border, backgroundColor: theme.card + 'E6' }}
              >
                <Feather name={isSel ? 'check-circle' : 'circle'} size={18} color={isSel ? theme.primary : theme.textMuted} />
                <View style={{ flex: 1, marginLeft: 12 }}>
                  <Text style={{ color: theme.text, fontSize: 14, fontFamily: 'Inter_600SemiBold', letterSpacing: 1 }}>{plan.label}</Text>
                  <Text style={{ color: theme.textMuted, fontSize: 12, fontFamily: 'Inter_400Regular' }}>
                    {priceFor(plan.sku)} {plan.period}, auto-renews
                  </Text>
                </View>
                {plan.note && !isCurrent && (
                  <Text style={{ color: theme.secondary, fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 1 }}>{plan.note.toUpperCase()}</Text>
                )}
                {isCurrent && (
                  <Text style={{ color: theme.primary, fontSize: 10, fontFamily: 'Inter_700Bold', letterSpacing: 1 }}>CURRENT</Text>
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        <TouchableOpacity
          onPress={subscribe}
          disabled={busy || selected === tier}
          style={{ marginTop: 16, paddingVertical: 15, borderRadius: theme.radius, backgroundColor: theme.primary, alignItems: 'center', opacity: busy || selected === tier ? 0.6 : 1 }}
        >
          {busySku === selectedPlan.sku ? (
            <ActivityIndicator color={theme.background} />
          ) : (
            <Text style={{ color: theme.background, fontSize: 15, fontFamily: 'Inter_700Bold', letterSpacing: 1 }}>
              {selected === tier ? 'CURRENT PLAN' : `SUBSCRIBE · ${priceFor(selectedPlan.sku)} ${selectedPlan.period}`}
            </Text>
          )}
        </TouchableOpacity>

        <Text style={{ color: theme.textMuted, fontSize: 11, fontFamily: 'Inter_600SemiBold', letterSpacing: 2, marginTop: 26, marginBottom: 10 }}>ONE-TIME PURCHASES</Text>

        <OneTimeRow
          icon="x-circle"
          title="Remove Ads"
          subtitle={hasRemovedAds ? (isPro ? 'Included with Pro' : 'Purchased') : `One-time · ${priceFor(REMOVE_ADS_SKU)}`}
          owned={hasRemovedAds}
          busy={busySku === REMOVE_ADS_SKU}
          disabled={busy || hasRemovedAds}
          onPress={purchaseAdRemoval}
        />
        <OneTimeRow
          icon="droplet"
          title="Theme Expansion Pack"
          subtitle={hasThemeExpansion ? 'Purchased' : themePackReady ? `One-time · ${priceFor(THEME_EXPANSION_SKU)}` : 'Coming soon'}
          owned={hasThemeExpansion}
          busy={busySku === THEME_EXPANSION_SKU}
          disabled={busy || hasThemeExpansion || !themePackReady}
          onPress={purchaseThemeExpansion}
        />

        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 22, marginTop: 18 }}>
          <TouchableOpacity onPress={restorePurchases} disabled={busy}>
            <Text style={{ color: theme.primary, fontSize: 13, fontFamily: 'Inter_600SemiBold', textDecorationLine: 'underline' }}>
              {busySku === 'restore' ? 'Restoring…' : 'Restore Purchases'}
            </Text>
          </TouchableOpacity>
          {isPro && (
            <TouchableOpacity onPress={manageSubscriptions}>
              <Text style={{ color: theme.primary, fontSize: 13, fontFamily: 'Inter_600SemiBold', textDecorationLine: 'underline' }}>Manage Subscription</Text>
            </TouchableOpacity>
          )}
        </View>

        <Text style={{ color: theme.textMuted, fontSize: 11, fontFamily: 'Inter_400Regular', lineHeight: 17, marginTop: 22 }}>
          {AUTO_RENEW_DISCLOSURE}
        </Text>
        <Text style={{ color: theme.textMuted, fontSize: 11, fontFamily: 'Inter_400Regular', lineHeight: 17, marginTop: 10 }}>
          {PRICE_CHANGE_DISCLAIMER}
        </Text>
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 22, marginTop: 14 }}>
          <TouchableOpacity onPress={() => WebBrowser.openBrowserAsync(TERMS_OF_USE_URL)}>
            <Text style={{ color: theme.textMuted, fontSize: 12, fontFamily: 'Inter_500Medium', textDecorationLine: 'underline' }}>Terms of Use (EULA)</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => WebBrowser.openBrowserAsync(PRIVACY_POLICY_URL)}>
            <Text style={{ color: theme.textMuted, fontSize: 12, fontFamily: 'Inter_500Medium', textDecorationLine: 'underline' }}>Privacy Policy</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

function OneTimeRow({ icon, title, subtitle, owned, busy, disabled, onPress }: {
  icon: React.ComponentProps<typeof Feather>['name'];
  title: string;
  subtitle: string;
  owned: boolean;
  busy: boolean;
  disabled: boolean;
  onPress: () => void;
}) {
  const { theme } = useTheme();
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      style={{ backgroundColor: theme.card + 'E6', borderRadius: theme.radius, borderWidth: 1, borderColor: theme.border, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10, opacity: disabled && !owned ? 0.6 : 1 }}
    >
      <Feather name={icon} size={20} color={theme.accent} />
      <View style={{ flex: 1 }}>
        <Text style={{ color: theme.text, fontSize: 14, fontFamily: 'Inter_500Medium' }}>{title}</Text>
        <Text style={{ color: theme.textMuted, fontSize: 12, fontFamily: 'Inter_400Regular' }}>{subtitle}</Text>
      </View>
      {busy ? (
        <ActivityIndicator color={theme.accent} />
      ) : owned ? (
        <Feather name="check" size={18} color={theme.accent} />
      ) : (
        <Text style={{ color: theme.accent, fontSize: 13, fontFamily: 'Inter_600SemiBold' }}>{disabled ? '' : 'BUY'}</Text>
      )}
    </TouchableOpacity>
  );
}
