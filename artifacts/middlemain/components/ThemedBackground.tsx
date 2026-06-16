import React from 'react';
import { ImageBackground, StyleSheet, View } from 'react-native';
import { themeBackgrounds } from '@/constants/backgrounds';
import { useTheme } from '@/context/ThemeContext';

interface ThemedBackgroundProps {
  children: React.ReactNode;
  style?: object;
}

export function ThemedBackground({ children, style }: ThemedBackgroundProps) {
  const { theme } = useTheme();
  const bgImage = themeBackgrounds[theme.name];

  if (!bgImage) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }, style]}>
        {children}
      </View>
    );
  }

  return (
    <ImageBackground
      source={bgImage}
      style={[styles.container, style]}
      resizeMode="cover"
    >
      <View style={[styles.overlay, { backgroundColor: theme.background + 'AA' }]}>
        {children}
      </View>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  overlay: {
    flex: 1,
  },
});
