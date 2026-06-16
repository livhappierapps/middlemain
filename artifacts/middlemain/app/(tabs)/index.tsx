import { Feather } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AdBanner } from '@/components/AdBanner';
import { NeonCard } from '@/components/NeonCard';
import { NeonText } from '@/components/NeonText';
import { ThemedBackground } from '@/components/ThemedBackground';
import { useAI } from '@/context/AIContext';
import { usePurchase } from '@/context/PurchaseContext';
import { useTheme } from '@/context/ThemeContext';

const STATUS_COLORS: Record<string, string> = {
  ok: '#00ff88',
  error: '#ff4466',
  untested: '#888888',
};

function PulseView({ color, size = 10 }: { color: string; size?: number }) {
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.6, duration: 900, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 900, useNativeDriver: true }),
      ]),
    ).start();
  }, [pulse]);
  return (
    <View style={{ width: size + 8, height: size + 8, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View
        style={{
          position: 'absolute',
          width: size + 8,
          height: size + 8,
          borderRadius: (size + 8) / 2,
          backgroundColor: color + '44',
          transform: [{ scale: pulse }],
        }}
      />
      <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color, shadowColor: color, shadowOffset: { width: 0, height: 0 }, shadowRadius: 8, shadowOpacity: 1 }} />
    </View>
  );
}

export default function HomeScreen() {
  const { theme } = useTheme();
  const { connections, serverGrokAvailable, addServerGrokConnection } = useAI();
  const { tier } = usePurchase();
  const insets = useSafeAreaInsets();
  const hasServerConn = connections.some((c) => c.provider === 'server');

  const glitch = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(4000),
        Animated.timing(glitch, { toValue: 1, duration: 60, useNativeDriver: true }),
        Animated.timing(glitch, { toValue: 0, duration: 60, useNativeDriver: true }),
        Animated.timing(glitch, { toValue: 1, duration: 40, useNativeDriver: true }),
        Animated.timing(glitch, { toValue: 0, duration: 40, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [glitch]);

  const glitchStyle = {
    transform: [{ translateX: glitch.interpolate({ inputRange: [0, 1], outputRange: [0, 3] }) }],
  };

  const activeConn = connections.find((c) => c.isActive) ?? connections[0];
  const okCount = connections.filter((c) => c.testStatus === 'ok').length;
  const topInset = Platform.OS === 'web' ? 67 : insets.top;

  return (
    <ThemedBackground>
      <LinearGradient
        colors={[theme.primary + '18', 'transparent', 'transparent']}
        style={StyleSheet.absoluteFill}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 0.4 }}
      />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingTop: topInset + 20, paddingBottom: Platform.OS === 'web' ? 34 : 20, paddingHorizontal: 16 }}
        showsVerticalScrollIndicator={false}
      >
        {/* Logo */}
        <View style={{ alignItems: 'center', marginBottom: 8 }}>
          <Animated.View style={glitchStyle}>
            <NeonText size={38} weight="700" letterSpacing={6} style={{ textAlign: 'center' }}>
              MIDDLEMAIN
            </NeonText>
          </Animated.View>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 6, alignItems: 'center' }}>
            <View style={{ backgroundColor: theme.secondary + '22', borderWidth: 1, borderColor: theme.secondary, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 }}>
              <Text style={{ color: theme.secondary, fontSize: 9, fontFamily: 'Inter_700Bold', letterSpacing: 2, textShadowColor: theme.secondary, textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 6 }}>
                BETA v0.1
              </Text>
            </View>
            {tier !== 'free' && (
              <View style={{ backgroundColor: theme.primary + '22', borderWidth: 1, borderColor: theme.primary, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 }}>
                <Text style={{ color: theme.primary, fontSize: 9, fontFamily: 'Inter_700Bold', letterSpacing: 2 }}>PRO</Text>
              </View>
            )}
          </View>
          <Text style={{ color: theme.textMuted, fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 8, letterSpacing: 1, textAlign: 'center' }}>
            UNIVERSAL AI DEVELOPMENT BRIDGE
          </Text>
        </View>

        {/* Quick-setup banner — server Grok detected */}
        {serverGrokAvailable && !hasServerConn && (
          <TouchableOpacity
            onPress={() => { addServerGrokConnection(); }}
            style={{
              backgroundColor: theme.secondary + '18',
              borderWidth: 1,
              borderColor: theme.secondary,
              borderRadius: theme.radius,
              padding: 12,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
              marginBottom: 14,
            }}
          >
            <Feather name="zap" size={18} color={theme.secondary} />
            <View style={{ flex: 1 }}>
              <Text style={{ color: theme.secondary, fontSize: 13, fontFamily: 'Inter_600SemiBold', textShadowColor: theme.secondary, textShadowOffset: { width: 0, height: 0 }, textShadowRadius: 6 }}>
                Dev's Grok is ready
              </Text>
              <Text style={{ color: theme.textMuted, fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: 2 }}>
                Server key detected — tap to connect instantly
              </Text>
            </View>
            <Feather name="chevron-right" size={16} color={theme.secondary} />
          </TouchableOpacity>
        )}

        {/* Stats row */}
        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 20, marginTop: 10 }}>
          {[
            { label: 'CONNECTIONS', value: connections.length.toString(), color: theme.primary },
            { label: 'ONLINE', value: okCount.toString(), color: '#00ff88' },
            { label: 'STATUS', value: connections.length > 0 ? 'READY' : 'IDLE', color: theme.secondary },
          ].map((stat) => (
            <NeonCard key={stat.label} style={{ flex: 1, padding: 12, alignItems: 'center' }} accentColor={stat.color}>
              <NeonText size={22} weight="700" color={stat.color} glow>
                {stat.value}
              </NeonText>
              <Text style={{ color: theme.textMuted, fontSize: 9, fontFamily: 'Inter_600SemiBold', letterSpacing: 1, marginTop: 4 }}>
                {stat.label}
              </Text>
            </NeonCard>
          ))}
        </View>

        {/* Active AI */}
        {activeConn ? (
          <NeonCard style={{ marginBottom: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View>
                <Text style={{ color: theme.textMuted, fontSize: 10, fontFamily: 'Inter_600SemiBold', letterSpacing: 2, marginBottom: 4 }}>
                  ACTIVE AI
                </Text>
                <NeonText size={16} weight="700" glow>
                  {activeConn.name}
                </NeonText>
                <Text style={{ color: theme.textMuted, fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 2 }}>
                  {activeConn.model}
                </Text>
              </View>
              <View style={{ alignItems: 'flex-end', gap: 8 }}>
                <PulseView color={STATUS_COLORS[activeConn.testStatus ?? 'untested']} size={10} />
                <TouchableOpacity
                  onPress={() => router.push('/(tabs)/terminal')}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 4,
                    paddingHorizontal: 10,
                    paddingVertical: 6,
                    borderRadius: theme.radius,
                    borderWidth: 1,
                    borderColor: theme.primary,
                  }}
                >
                  <Feather name="terminal" size={12} color={theme.primary} />
                  <Text style={{ color: theme.primary, fontSize: 11, fontFamily: 'Inter_600SemiBold', letterSpacing: 1 }}>
                    BRIDGE
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </NeonCard>
        ) : (
          <NeonCard style={{ marginBottom: 16 }} accentColor={theme.textMuted}>
            <View style={{ alignItems: 'center', paddingVertical: 8 }}>
              <Feather name="wifi-off" size={28} color={theme.textMuted} style={{ marginBottom: 8 }} />
              <Text style={{ color: theme.textMuted, fontSize: 13, fontFamily: 'Inter_400Regular', textAlign: 'center' }}>
                No AI connected
              </Text>
              <TouchableOpacity
                onPress={() => router.push('/(tabs)/connections')}
                style={{ marginTop: 12, paddingHorizontal: 16, paddingVertical: 8, borderRadius: theme.radius, borderWidth: 1, borderColor: theme.primary }}
              >
                <Text style={{ color: theme.primary, fontSize: 12, fontFamily: 'Inter_600SemiBold', letterSpacing: 1 }}>
                  ADD CONNECTION
                </Text>
              </TouchableOpacity>
            </View>
          </NeonCard>
        )}

        {/* Quick actions */}
        <Text style={{ color: theme.textMuted, fontSize: 10, fontFamily: 'Inter_600SemiBold', letterSpacing: 2, marginBottom: 10 }}>
          QUICK ACTIONS
        </Text>
        <View style={{ gap: 10 }}>
          {[
            { icon: 'terminal', label: 'Open Bridge Terminal', sub: 'Test and debug AI code', route: '/(tabs)/terminal', color: theme.primary },
            { icon: 'link', label: 'Manage Connections', sub: 'Add or configure AI APIs', route: '/(tabs)/connections', color: theme.secondary },
            { icon: 'settings', label: 'Settings & Themes', sub: 'Customize your workspace', route: '/(tabs)/settings', color: theme.accent },
          ].map((action) => (
            <NeonCard key={action.label} onPress={() => router.push(action.route as any)} accentColor={action.color} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14 }}>
              <View style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: action.color + '22', alignItems: 'center', justifyContent: 'center' }}>
                <Feather name={action.icon as any} size={20} color={action.color} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: theme.text, fontSize: 14, fontFamily: 'Inter_600SemiBold' }}>{action.label}</Text>
                <Text style={{ color: theme.textMuted, fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 2 }}>{action.sub}</Text>
              </View>
              <Feather name="chevron-right" size={18} color={theme.textMuted} />
            </NeonCard>
          ))}
        </View>

        {/* All connections */}
        {connections.length > 0 && (
          <View style={{ marginTop: 20 }}>
            <Text style={{ color: theme.textMuted, fontSize: 10, fontFamily: 'Inter_600SemiBold', letterSpacing: 2, marginBottom: 10 }}>
              ALL CONNECTIONS
            </Text>
            {connections.map((conn) => (
              <View key={conn.id} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: theme.border, gap: 10 }}>
                <PulseView color={STATUS_COLORS[conn.testStatus ?? 'untested']} size={8} />
                <View style={{ flex: 1 }}>
                  <Text style={{ color: theme.text, fontSize: 13, fontFamily: 'Inter_500Medium' }}>{conn.name}</Text>
                  <Text style={{ color: theme.textMuted, fontSize: 11, fontFamily: 'Inter_400Regular' }}>{conn.model}</Text>
                </View>
                {conn.isActive && (
                  <View style={{ backgroundColor: theme.primary + '22', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                    <Text style={{ color: theme.primary, fontSize: 9, fontFamily: 'Inter_600SemiBold', letterSpacing: 1 }}>ACTIVE</Text>
                  </View>
                )}
              </View>
            ))}
          </View>
        )}
        {/* Footer */}
        <TouchableOpacity
          onPress={() => WebBrowser.openBrowserAsync('https://livhappierapps.com/apps/middlemain')}
          style={{ marginTop: 28, marginBottom: 8, alignItems: 'center', paddingVertical: 8 }}
        >
          <Text style={{ color: theme.textMuted, fontSize: 11, fontFamily: 'Inter_400Regular', letterSpacing: 0.5 }}>
            livhappierapps.com/apps/middlemain
          </Text>
          <Text style={{ color: theme.textMuted, fontSize: 10, fontFamily: 'Inter_400Regular', marginTop: 2, opacity: 0.6 }}>
            by LivHappier Apps · Beta v0.1
          </Text>
        </TouchableOpacity>
      </ScrollView>
      <AdBanner onUpgradePress={() => router.push('/(tabs)/settings')} />
    </ThemedBackground>
  );
}
