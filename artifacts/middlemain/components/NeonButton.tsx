import React from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  ViewStyle,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { useTheme } from '@/context/ThemeContext';

interface NeonButtonProps {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
}

const AnimatedTouchable = Animated.createAnimatedComponent(TouchableOpacity);

export function NeonButton({
  label,
  onPress,
  variant = 'primary',
  loading = false,
  disabled = false,
  style,
  size = 'md',
  fullWidth = false,
}: NeonButtonProps) {
  const { theme } = useTheme();
  const scale = useSharedValue(1);

  const colorMap = {
    primary: theme.primary,
    secondary: theme.secondary,
    ghost: 'transparent',
    danger: theme.destructive,
  };
  const color = colorMap[variant];

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const handlePress = () => {
    if (disabled || loading) return;
    scale.value = withSpring(0.94, { damping: 20 }, () => {
      scale.value = withSpring(1, { damping: 20 });
    });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onPress();
  };

  const padding = size === 'sm' ? { paddingVertical: 8, paddingHorizontal: 16 } :
    size === 'lg' ? { paddingVertical: 16, paddingHorizontal: 32 } :
    { paddingVertical: 12, paddingHorizontal: 24 };

  const fontSize = size === 'sm' ? 13 : size === 'lg' ? 17 : 15;

  return (
    <AnimatedTouchable
      activeOpacity={1}
      onPress={handlePress}
      disabled={disabled || loading}
      style={[
        animStyle,
        {
          borderRadius: theme.radius,
          borderWidth: variant === 'ghost' ? 1 : 0,
          borderColor: color,
          backgroundColor: variant === 'ghost' ? 'transparent' : color,
          shadowColor: color,
          shadowOffset: { width: 0, height: 0 },
          shadowRadius: variant === 'ghost' ? 6 : 10,
          shadowOpacity: disabled ? 0.2 : 0.6,
          elevation: 6,
          opacity: disabled ? 0.5 : 1,
          alignSelf: fullWidth ? 'stretch' : 'flex-start',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'row',
          gap: 8,
          ...padding,
        },
        style,
      ]}
    >
      {loading && <ActivityIndicator size="small" color={variant === 'ghost' ? color : theme.background} />}
      <Text
        style={{
          color: variant === 'ghost' ? color : theme.background,
          fontSize,
          fontFamily: 'Inter_600SemiBold',
          letterSpacing: 1,
          textShadowColor: variant === 'ghost' ? color : 'transparent',
          textShadowOffset: { width: 0, height: 0 },
          textShadowRadius: 8,
        }}
      >
        {label.toUpperCase()}
      </Text>
    </AnimatedTouchable>
  );
}
