import { Feather } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePurchase } from '@/context/PurchaseContext';
import { useTheme } from '@/context/ThemeContext';

interface AdBannerProps {
  onUpgradePress?: () => void;
}

export function AdBanner({ onUpgradePress }: AdBannerProps) {
  const { hasRemovedAds } = usePurchase();
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();

  if (hasRemovedAds) return null;

  return (
    <View
      style={{
        backgroundColor: theme.surface + 'E6',
        borderTopWidth: 1,
        borderTopColor: theme.border,
        paddingBottom: insets.bottom > 0 ? insets.bottom : 8,
        paddingTop: 6,
        paddingHorizontal: 16,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}
    >
      <View style={{ flex: 1 }}>
        <Text style={{ color: theme.textMuted, fontSize: 11, fontFamily: 'Inter_400Regular' }}>
          SPONSORED
        </Text>
        <Text style={{ color: theme.text, fontSize: 13, fontFamily: 'Inter_400Regular' }}>
          Build faster with Middlemain Pro
        </Text>
      </View>
      <TouchableOpacity
        onPress={onUpgradePress}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 4,
          paddingHorizontal: 12,
          paddingVertical: 6,
          borderRadius: theme.radius,
          borderWidth: 1,
          borderColor: theme.primary,
        }}
      >
        <Text
          style={{
            color: theme.primary,
            fontSize: 12,
            fontFamily: 'Inter_600SemiBold',
            textShadowColor: theme.primary,
            textShadowOffset: { width: 0, height: 0 },
            textShadowRadius: 6,
          }}
        >
          REMOVE
        </Text>
        <Feather name="x" size={12} color={theme.primary} />
      </TouchableOpacity>
    </View>
  );
}
