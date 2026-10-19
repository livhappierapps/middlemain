import { Feather } from "@expo/vector-icons";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { isLiquidGlassAvailable } from "expo-glass-effect";
import { Tabs } from "expo-router";
import { Icon, Label, NativeTabs } from "expo-router/unstable-native-tabs";
import { SymbolView } from "expo-symbols";
import React from "react";
import { Platform, StyleSheet, View } from "react-native";
import { useTheme } from "@/context/ThemeContext";

function NativeTabLayout() {
  return (
    <NativeTabs>
      <NativeTabs.Trigger name="index">
        <Icon sf={{ default: "house", selected: "house.fill" }} />
        <Label>Home</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="terminal">
        <Icon sf={{ default: "terminal", selected: "terminal.fill" }} />
        <Label>Bridge</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="connections">
        <Icon sf={{ default: "link", selected: "link" }} />
        <Label>Connect</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="council">
        <Icon sf={{ default: "person.3", selected: "person.3.fill" }} />
        <Label>Council</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="guide">
        <Icon sf={{ default: "person", selected: "person.fill" }} />
        <Label>Man in the MiddleMain</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="hands">
        <Icon sf={{ default: "hand.wave", selected: "hand.wave.fill" }} />
        <Label>Human Hands</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="debug">
        <Icon sf={{ default: "ant", selected: "ant.fill" }} />
        <Label>Debug</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="settings">
        <Icon sf={{ default: "gearshape", selected: "gearshape.fill" }} />
        <Label>Settings</Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}

function ClassicTabLayout() {
  const { theme } = useTheme();
  const isIOS = Platform.OS === "ios";
  const isWeb = Platform.OS === "web";

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.primary,
        tabBarInactiveTintColor: theme.textMuted,
        tabBarStyle: {
          position: "absolute",
          backgroundColor: isIOS ? "transparent" : theme.surface,
          borderTopWidth: 1,
          borderTopColor: theme.border,
          elevation: 0,
          ...(isWeb ? { height: 84 } : {}),
          shadowColor: theme.primary,
          shadowOffset: { width: 0, height: -2 },
          shadowRadius: 8,
          shadowOpacity: 0.15,
        },
        tabBarBackground: () =>
          isIOS ? (
            <BlurView
              intensity={80}
              tint="dark"
              style={StyleSheet.absoluteFill}
            />
          ) : isWeb ? (
            <View
              style={[StyleSheet.absoluteFill, { backgroundColor: theme.surface }]}
            />
          ) : null,
        tabBarLabelStyle: {
          fontFamily: "Inter_600SemiBold",
          fontSize: 10,
          letterSpacing: 0.5,
          textShadowColor: theme.primary,
          textShadowOffset: { width: 0, height: 0 },
          textShadowRadius: 0,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Home",
          tabBarIcon: ({ color, focused }) =>
            isIOS ? (
              <SymbolView
                name={focused ? "house.fill" : "house"}
                tintColor={color}
                size={22}
              />
            ) : (
              <Feather name="home" size={20} color={color} />
            ),
        }}
      />
      <Tabs.Screen
        name="terminal"
        options={{
          title: "Bridge",
          tabBarIcon: ({ color, focused }) =>
            isIOS ? (
              <SymbolView
                name="terminal"
                tintColor={color}
                size={22}
              />
            ) : (
              <Feather name="terminal" size={20} color={color} />
            ),
        }}
      />
      <Tabs.Screen
        name="connections"
        options={{
          title: "Connect",
          tabBarIcon: ({ color }) =>
            isIOS ? (
              <SymbolView name="link" tintColor={color} size={22} />
            ) : (
              <Feather name="link" size={20} color={color} />
            ),
        }}
      />
      <Tabs.Screen
        name="council"
        options={{
          title: "Council",
          tabBarIcon: ({ color, focused }) =>
            isIOS ? (
              <SymbolView
                name={focused ? "person.3.fill" : "person.3"}
                tintColor={color}
                size={22}
              />
            ) : (
              <Feather name="users" size={20} color={color} />
            ),
        }}
      />
      <Tabs.Screen
        name="guide"
        options={{
          title: "Man in the MiddleMain",
          tabBarIcon: ({ color, focused }) =>
            isIOS ? (
              <SymbolView
                name={focused ? "person.fill" : "person"}
                tintColor={color}
                size={22}
              />
            ) : (
              <Feather name="user" size={20} color={color} />
            ),
        }}
      />
      <Tabs.Screen
        name="debug"
        options={{
          title: "Debug",
          tabBarIcon: ({ color }) =>
            isIOS ? (
              <SymbolView name="ant" tintColor={color} size={22} />
            ) : (
              <Feather name="alert-triangle" size={20} color={color} />
            ),
        }}
      />
      <Tabs.Screen
        name="hands"
        options={{
          title: "Human Hands",
          tabBarIcon: ({ color }) => (
            <MaterialCommunityIcons name="hand-wave-outline" size={21} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "Settings",
          tabBarIcon: ({ color, focused }) =>
            isIOS ? (
              <SymbolView
                name={focused ? "gearshape.fill" : "gearshape"}
                tintColor={color}
                size={22}
              />
            ) : (
              <Feather name="settings" size={20} color={color} />
            ),
        }}
      />
    </Tabs>
  );
}

export default function TabLayout() {
  if (isLiquidGlassAvailable()) {
    return <NativeTabLayout />;
  }
  return <ClassicTabLayout />;
}
