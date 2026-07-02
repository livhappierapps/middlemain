import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Text, View } from 'react-native';
import { useTheme } from '@/context/ThemeContext';

export interface CursorAction {
  x: number;
  y: number;
  tap?: boolean;
  scroll?: { direction: 'up' | 'down'; px: number };
  label?: string;
}

interface Props {
  visible: boolean;
  action: CursorAction | null;
  containerWidth: number;
  containerHeight: number;
}

export function AICursorOverlay({ visible, action, containerWidth, containerHeight }: Props) {
  const { theme } = useTheme();
  const cursorX = useRef(new Animated.Value(containerWidth / 2)).current;
  const cursorY = useRef(new Animated.Value(containerHeight / 2)).current;
  const rippleScale = useRef(new Animated.Value(0)).current;
  const rippleOpacity = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const [label, setLabel] = useState<string | null>(null);

  // Idle pulse
  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 1.25, duration: 900, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 900, useNativeDriver: true, easing: Easing.inOut(Easing.ease) }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, []);

  useEffect(() => {
    if (!action || containerWidth === 0 || containerHeight === 0) return;

    const targetX = action.x * containerWidth;
    const targetY = action.y * containerHeight;

    if (action.label) setLabel(action.label);

    Animated.spring(cursorX, {
      toValue: targetX,
      useNativeDriver: false,
      tension: 60,
      friction: 10,
    }).start();

    Animated.spring(cursorY, {
      toValue: targetY,
      useNativeDriver: false,
      tension: 60,
      friction: 10,
    }).start(() => {
      if (action.tap) {
        rippleScale.setValue(0);
        rippleOpacity.setValue(0.8);
        Animated.parallel([
          Animated.timing(rippleScale, { toValue: 3, duration: 500, useNativeDriver: true }),
          Animated.timing(rippleOpacity, { toValue: 0, duration: 500, useNativeDriver: true }),
        ]).start();
      }
    });
  }, [action]);

  if (!visible) return null;

  const CURSOR_SIZE = 28;
  const DOT_SIZE = 8;

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: Animated.subtract(cursorX, CURSOR_SIZE / 2),
        top: Animated.subtract(cursorY, CURSOR_SIZE / 2),
        width: CURSOR_SIZE,
        height: CURSOR_SIZE,
        zIndex: 9999,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {/* Ripple on tap */}
      <Animated.View
        style={{
          position: 'absolute',
          width: CURSOR_SIZE,
          height: CURSOR_SIZE,
          borderRadius: CURSOR_SIZE / 2,
          borderWidth: 2,
          borderColor: theme.accent,
          opacity: rippleOpacity,
          transform: [{ scale: rippleScale }],
        }}
      />

      {/* Outer glow ring */}
      <Animated.View
        style={{
          position: 'absolute',
          width: CURSOR_SIZE,
          height: CURSOR_SIZE,
          borderRadius: CURSOR_SIZE / 2,
          borderWidth: 1.5,
          borderColor: theme.primary + 'AA',
          transform: [{ scale: pulseAnim }],
        }}
      />

      {/* Center dot */}
      <View style={{
        width: DOT_SIZE,
        height: DOT_SIZE,
        borderRadius: DOT_SIZE / 2,
        backgroundColor: theme.primary,
        shadowColor: theme.primary,
        shadowOffset: { width: 0, height: 0 },
        shadowRadius: 8,
        shadowOpacity: 1,
        elevation: 10,
      }} />

      {/* Label */}
      {label && (
        <View style={{
          position: 'absolute',
          top: CURSOR_SIZE + 4,
          left: 0,
          backgroundColor: theme.surface + 'EE',
          borderWidth: 1,
          borderColor: theme.primary,
          borderRadius: 4,
          paddingHorizontal: 6,
          paddingVertical: 2,
          minWidth: 50,
        }}>
          <Text style={{ color: theme.primary, fontSize: 9, fontFamily: 'Inter_600SemiBold', textAlign: 'center' }}>
            LEO
          </Text>
        </View>
      )}
    </Animated.View>
  );
}

export function parseCursorAction(text: string): CursorAction | null {
  // Parse ```cursor\n{...}\n``` blocks from AI response
  const codeBlockMatch = text.match(/```cursor\s*\n([\s\S]*?)\n```/);
  if (codeBlockMatch) {
    try {
      const data = JSON.parse(codeBlockMatch[1].trim());
      if (typeof data.x === 'number' && typeof data.y === 'number') {
        return {
          x: Math.min(1, Math.max(0, data.x)),
          y: Math.min(1, Math.max(0, data.y)),
          tap: data.tap === true,
          scroll: data.scroll,
          label: data.label,
        };
      }
    } catch {}
  }

  // Also check inline JSON: |||CURSOR:{"x":0.5,"y":0.3}|||
  const inlineMatch = text.match(/\|\|\|CURSOR:([\s\S]*?)\|\|\|/);
  if (inlineMatch) {
    try {
      const data = JSON.parse(inlineMatch[1]);
      if (typeof data.x === 'number' && typeof data.y === 'number') {
        return {
          x: Math.min(1, Math.max(0, data.x)),
          y: Math.min(1, Math.max(0, data.y)),
          tap: data.tap,
          scroll: data.scroll,
          label: data.label,
        };
      }
    } catch {}
  }

  return null;
}

export function stripCursorBlock(text: string): string {
  return text
    .replace(/```cursor\s*\n[\s\S]*?\n```/g, '')
    .replace(/\|\|\|CURSOR:[\s\S]*?\|\|\|/g, '')
    .trim();
}
