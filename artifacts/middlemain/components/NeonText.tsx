import React from 'react';
import { StyleSheet, Text, TextStyle } from 'react-native';
import { useTheme } from '@/context/ThemeContext';

interface NeonTextProps {
  children: React.ReactNode;
  size?: number;
  color?: string;
  glow?: boolean;
  weight?: TextStyle['fontWeight'];
  style?: TextStyle;
  numberOfLines?: number;
  letterSpacing?: number;
}

export function NeonText({
  children,
  size = 16,
  color,
  glow = true,
  weight = '400',
  style,
  numberOfLines,
  letterSpacing,
}: NeonTextProps) {
  const { theme } = useTheme();
  const c = color ?? theme.primary;

  return (
    <Text
      numberOfLines={numberOfLines}
      style={[
        styles.base,
        {
          fontSize: size,
          color: c,
          fontWeight: weight,
          letterSpacing: letterSpacing ?? (weight === '700' || weight === 'bold' ? 2 : 0),
          ...(glow
            ? {
                textShadowColor: c,
                textShadowOffset: { width: 0, height: 0 },
                textShadowRadius: 12,
              }
            : {}),
        },
        style,
      ]}
    >
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  base: {
    fontFamily: 'Inter_600SemiBold',
  },
});
