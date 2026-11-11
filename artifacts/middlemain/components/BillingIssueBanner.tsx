import { Feather } from '@expo/vector-icons';
import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { usePurchase } from '@/context/PurchaseContext';
import { useTheme } from '@/context/ThemeContext';

/**
 * Gentle notice shown when Apple reports a renewal payment problem (Billing Grace Period or
 * Billing Retry). It never blocks the app; during the grace period Pro stays fully unlocked.
 */
export function BillingIssueBanner({ style }: { style?: object }) {
  const { theme } = useTheme();
  const { billingIssue, manageSubscriptions } = usePurchase();
  if (!billingIssue) return null;
  const until = billingIssue.graceEndsAt
    ? ` until ${new Date(billingIssue.graceEndsAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
    : '';
  const body = billingIssue.kind === 'grace'
    ? `Apple couldn't renew your subscription. You still have full access${until}. Update your payment method to keep Pro.`
    : "Apple couldn't renew your subscription and is retrying. Update your payment method to keep Pro. You won't be charged twice.";
  return (
    <TouchableOpacity
      onPress={manageSubscriptions}
      accessibilityRole="button"
      accessibilityLabel="Payment issue. Manage subscription"
      style={[{ flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: theme.secondary, borderRadius: theme.radius, padding: 12, backgroundColor: theme.secondary + '18' }, style]}
    >
      <Feather name="credit-card" size={16} color={theme.secondary} />
      <View style={{ flex: 1 }}>
        <Text style={{ color: theme.text, fontSize: 13, fontFamily: 'Inter_400Regular' }}>{body}</Text>
        <Text style={{ color: theme.secondary, fontSize: 12, fontFamily: 'Inter_600SemiBold', marginTop: 4, textDecorationLine: 'underline' }}>Manage subscription</Text>
      </View>
    </TouchableOpacity>
  );
}
