import { Feather } from '@expo/vector-icons';
import { router } from 'expo-router';
import React from 'react';
import { Text, TouchableOpacity, View } from 'react-native';
import { useAI } from '@/context/AIContext';
import { useTheme } from '@/context/ThemeContext';

export function ServerGrokNotice() {
  const { serverGrokStatus } = useAI();
  const { theme } = useTheme();

  if (serverGrokStatus !== 'missing') return null;

  return (
    <View
      style={{
        marginHorizontal: 16,
        marginBottom: 14,
        padding: 13,
        borderWidth: 1,
        borderColor: '#f59e0b88',
        borderRadius: theme.radius,
        backgroundColor: '#f59e0b12',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
      }}
    >
      <Feather name="zap" size={18} color="#f59e0b" />
      <View style={{ flex: 1 }}>
        <Text style={{ color: theme.text, fontSize: 13, fontFamily: 'Inter_600SemiBold' }}>
          Server Grok and Leo need an xAI key
        </Text>
        <Text style={{ color: theme.textMuted, fontSize: 11, fontFamily: 'Inter_400Regular', lineHeight: 16, marginTop: 3 }}>
          Add your key in Settings → Middlemain Executive API. Your own Grok key can also be added under Connections.
        </Text>
      </View>
      <TouchableOpacity
        onPress={() => router.push('/(tabs)/settings')}
        accessibilityRole="button"
        accessibilityLabel="Open Settings to add the server xAI key"
        style={{ paddingVertical: 8, paddingLeft: 4 }}
      >
        <Feather name="chevron-right" size={18} color="#f59e0b" />
      </TouchableOpacity>
    </View>
  );
}
