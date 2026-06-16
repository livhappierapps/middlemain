import React from 'react';
import { StyleSheet, TouchableOpacity, View, ViewStyle } from 'react-native';
import { useTheme } from '@/context/ThemeContext';

interface NeonCardProps {
  children: React.ReactNode;
  onPress?: () => void;
  style?: ViewStyle;
  accentColor?: string;
  noBorder?: boolean;
}

export function NeonCard({ children, onPress, style, accentColor, noBorder }: NeonCardProps) {
  const { theme } = useTheme();
  const color = accentColor ?? theme.primary;

  const cardStyle: ViewStyle = {
    backgroundColor: theme.card + 'E6',
    borderRadius: theme.radius,
    borderWidth: noBorder ? 0 : 1,
    borderColor: color,
    padding: 16,
    shadowColor: color,
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 12,
    shadowOpacity: 0.5,
    elevation: 8,
  };

  if (onPress) {
    return (
      <TouchableOpacity activeOpacity={0.75} onPress={onPress} style={[cardStyle, style]}>
        {children}
      </TouchableOpacity>
    );
  }

  return <View style={[cardStyle, style]}>{children}</View>;
}
