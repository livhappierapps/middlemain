import React, { useEffect, useRef } from 'react';
import { Animated, Text, TouchableOpacity, View } from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useNetwork, ConnectionQuality } from '@/context/NetworkContext';
import { useTheme } from '@/context/ThemeContext';

const QUALITY_COLOR: Record<ConnectionQuality, string> = {
  good: '#00ff88',
  fair: '#ffcc00',
  poor: '#ff6600',
  offline: '#ff2244',
};

const QUALITY_LABEL: Record<ConnectionQuality, string> = {
  good: 'CONNECTED',
  fair: 'SLOW',
  poor: 'UNSTABLE',
  offline: 'OFFLINE',
};

export function NetworkStatusBar() {
  const { quality, pingMs, isOnline, checkNow } = useNetwork();
  const { theme } = useTheme();
  const slideAnim = useRef(new Animated.Value(0)).current;
  const prevOnline = useRef(isOnline);

  useEffect(() => {
    if (!isOnline && prevOnline.current) {
      Animated.spring(slideAnim, { toValue: 1, useNativeDriver: true, tension: 80, friction: 10 }).start();
    } else if (isOnline && !prevOnline.current) {
      setTimeout(() => {
        Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, tension: 80, friction: 10 }).start();
      }, 2500);
    }
    prevOnline.current = isOnline;
  }, [isOnline]);

  const color = QUALITY_COLOR[quality];
  const label = QUALITY_LABEL[quality];

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      {/* Offline banner — slides in from top when offline */}
      <Animated.View
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 9999,
          opacity: slideAnim,
          transform: [{ translateY: slideAnim.interpolate({ inputRange: [0, 1], outputRange: [-40, 0] }) }],
          backgroundColor: '#ff2244',
          paddingVertical: 5,
          alignItems: 'center',
        }}
        pointerEvents="none"
      >
        <Text style={{ color: '#fff', fontSize: 11, fontFamily: 'Inter_600SemiBold', letterSpacing: 1 }}>
          ⚠ CONNECTION LOST — RECONNECTING
        </Text>
      </Animated.View>

      {/* Inline status pill */}
      <TouchableOpacity
        onPress={checkNow}
        style={{
          flexDirection: 'row', alignItems: 'center', gap: 4,
          paddingHorizontal: 7, paddingVertical: 3,
          borderRadius: 8,
          borderWidth: 1,
          borderColor: color + '55',
          backgroundColor: color + '15',
        }}
      >
        <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: color }} />
        <Text style={{ color, fontSize: 8, fontFamily: 'Inter_600SemiBold', letterSpacing: 0.5 }}>
          {label}
        </Text>
        {pingMs !== null && isOnline && (
          <Text style={{ color: color + 'AA', fontSize: 8, fontFamily: 'Inter_400Regular' }}>
            {pingMs}ms
          </Text>
        )}
        {!isOnline && (
          <Feather name="refresh-cw" size={8} color={color} />
        )}
      </TouchableOpacity>
    </View>
  );
}
