import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import React from 'react';
import { Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { ThemeKey, themes } from '@/constants/themes';
import { useTheme } from '@/context/ThemeContext';
import { themeBackgrounds } from '@/constants/backgrounds';
import { isExpansionTheme } from '@/constants/themes';

export function ThemeSelector() {
  const { themeKey, setTheme, theme, isThemeLocked } = useTheme();

  const handleSelect = (key: ThemeKey) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (isThemeLocked(key)) {
      // Theme Expansion Pack not owned yet: send the user to the paywall.
      router.push('/paywall');
      return;
    }
    setTheme(key);
  };

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingHorizontal: 16 }}>
      {(Object.keys(themes) as ThemeKey[]).map((key) => {
        const t = themes[key];
        const active = key === themeKey;
        const locked = isThemeLocked(key);
        return (
          <TouchableOpacity
            key={key}
            onPress={() => handleSelect(key)}
            style={{
              alignItems: 'center',
              gap: 8,
              width: 72,
            }}
          >
            <View
              style={{
                width: 60,
                height: 60,
                borderRadius: 12,
                backgroundColor: t.background,
                borderWidth: active ? 2 : 1.5,
                borderColor: active ? t.primary : t.border,
                overflow: 'hidden',
                shadowColor: active ? t.primary : 'transparent',
                shadowOffset: { width: 0, height: 0 },
                shadowRadius: active ? 10 : 0,
                shadowOpacity: active ? 0.9 : 0,
                elevation: active ? 8 : 0,
                justifyContent: 'center',
                alignItems: 'center',
              }}
            >
              {isExpansionTheme(key) && themeBackgrounds[key] != null && (
                <Image source={themeBackgrounds[key]!} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, width: '100%', height: '100%' }} resizeMode="cover" />
              )}
              <View style={{ flexDirection: 'row', gap: 3 }}>
                <View style={{ width: 10, height: 28, borderRadius: 2, backgroundColor: t.primary, shadowColor: t.primary, shadowOffset: { width: 0, height: 0 }, shadowRadius: 4, shadowOpacity: 0.8 }} />
                <View style={{ width: 10, height: 28, borderRadius: 2, backgroundColor: t.secondary, shadowColor: t.secondary, shadowOffset: { width: 0, height: 0 }, shadowRadius: 4, shadowOpacity: 0.8 }} />
              </View>
              {active && (
                <View style={{ position: 'absolute', top: 4, right: 4 }}>
                  <Feather name="check" size={10} color={t.primary} />
                </View>
              )}
              {locked && (
                <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#00000088', justifyContent: 'center', alignItems: 'center' }}>
                  <Feather name="lock" size={16} color="#FFFFFF" />
                  <Text style={{ color: '#FFFFFF', fontSize: 8, fontFamily: 'Inter_600SemiBold', marginTop: 2 }}>UNLOCK</Text>
                </View>
              )}
            </View>
            <Text
              style={{
                color: active ? theme.primary : theme.textMuted,
                fontSize: 10,
                fontFamily: 'Inter_600SemiBold',
                textAlign: 'center',
                letterSpacing: 0.5,
              }}
              numberOfLines={2}
            >
              {t.displayName.toUpperCase()}
            </Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}
