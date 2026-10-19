import { Feather } from '@expo/vector-icons';
import { ThemedBackground } from '@/components/ThemedBackground';
import { useTheme } from '@/context/ThemeContext';
import { useRouter } from 'expo-router';
import React, { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

type AppTheme = ReturnType<typeof useTheme>['theme'];

function stylesFor(theme: AppTheme) {
  return StyleSheet.create({
    page: { flexGrow: 1, paddingHorizontal: 16, paddingTop: 24, paddingBottom: 112 },
    title: { color: theme.text, fontFamily: 'Inter_700Bold', fontSize: 24, letterSpacing: 1.1 },
    subtitle: { color: theme.textMuted, fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 19, marginTop: 6 },
    card: { alignItems: 'center' as const, backgroundColor: theme.card, borderColor: theme.border, borderRadius: theme.radius, borderWidth: 1, flexDirection: 'row' as const, gap: 13, marginTop: 13, minHeight: 76, padding: 15 },
    icon: { alignItems: 'center' as const, backgroundColor: theme.surface, borderRadius: theme.radius, height: 42, justifyContent: 'center' as const, width: 42 },
    cardTitle: { color: theme.text, fontFamily: 'Inter_600SemiBold', fontSize: 15 },
    cardText: { color: theme.textMuted, flex: 1, fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 17, marginTop: 4 },
  });
}

const MORE_DESTINATIONS = [
  { route: '/(tabs)/council' as const, title: 'Council', description: 'Bring connected AIs together in a room.', icon: 'users' as const },
  { route: '/(tabs)/debug' as const, title: 'Debug', description: 'Inspect a repository and run build checks.', icon: 'alert-triangle' as const },
  { route: '/(tabs)/settings' as const, title: 'Settings', description: 'Manage app preferences and local data.', icon: 'settings' as const },
];

export default function MoreScreen() {
  const { theme } = useTheme();
  const styles = useMemo(() => stylesFor(theme), [theme]);
  const router = useRouter();

  return (
    <ThemedBackground>
      <ScrollView
        contentContainerStyle={styles.page}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.title}>MORE</Text>
        <Text style={styles.subtitle}>Additional MiddleMain tools.</Text>
        {MORE_DESTINATIONS.map((destination) => (
          <Pressable
            key={destination.route}
            onPress={() => router.push(destination.route)}
            accessibilityRole="button"
            style={styles.card}
          >
            <View style={styles.icon}>
              <Feather name={destination.icon} size={19} color={theme.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.cardTitle}>{destination.title}</Text>
              <Text style={styles.cardText}>{destination.description}</Text>
            </View>
            <Feather name="chevron-right" size={18} color={theme.textMuted} />
          </Pressable>
        ))}
      </ScrollView>
    </ThemedBackground>
  );
}
