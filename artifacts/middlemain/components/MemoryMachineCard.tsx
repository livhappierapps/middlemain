import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { useState } from 'react';
import { ActivityIndicator, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useMCP } from '@/context/MCPContext';
import { useTheme } from '@/context/ThemeContext';

const MEMORY_COLOR = '#a78bfa';
const MEMORY_DIM = '#a78bfa33';
const MEMORY_GLOW = '#a78bfa66';

export function MemoryMachineCard() {
  const { theme } = useTheme();
  const { config, updateConfig, status, errorMsg, tools, connect, disconnect } = useMCP();
  const [showToken, setShowToken] = useState(false);

  const statusColor = {
    idle: theme.textMuted,
    connecting: MEMORY_COLOR,
    connected: MEMORY_COLOR,
    error: theme.destructive,
  }[status];

  const statusLabel = {
    idle: 'NOT CONNECTED',
    connecting: 'CONNECTING…',
    connected: 'MEMORY ACTIVE',
    error: 'ERROR',
  }[status];

  const inputStyle = {
    backgroundColor: theme.surface + 'CC',
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: theme.radius,
    color: theme.text,
    fontSize: 13,
    fontFamily: 'Inter_400Regular',
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 6,
  };

  const labelStyle = {
    color: theme.textMuted,
    fontSize: 10,
    fontFamily: 'Inter_600SemiBold',
    letterSpacing: 1.5,
    marginTop: 12,
  };

  return (
    <View style={{
      marginHorizontal: 16,
      marginBottom: 18,
      backgroundColor: theme.card + 'E6',
      borderWidth: 1.5,
      borderColor: status === 'connected' ? MEMORY_GLOW : theme.border,
      borderRadius: theme.radius,
      padding: 16,
      shadowColor: status === 'connected' ? MEMORY_COLOR : theme.primary,
      shadowOffset: { width: 0, height: 0 },
      shadowRadius: 10,
      shadowOpacity: status === 'connected' ? 0.3 : 0.08,
      elevation: 4,
    }}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: MEMORY_DIM, alignItems: 'center', justifyContent: 'center' }}>
            <Feather name="database" size={16} color={MEMORY_COLOR} />
          </View>
          <View>
            <Text style={{ color: theme.text, fontSize: 14, fontFamily: 'Inter_600SemiBold' }}>
              Memory Machine
            </Text>
            <Text style={{ color: statusColor, fontSize: 10, fontFamily: 'Inter_600SemiBold', letterSpacing: 1 }}>
              {statusLabel}
            </Text>
          </View>
        </View>

        {status === 'connecting' ? (
          <ActivityIndicator size="small" color={MEMORY_COLOR} />
        ) : status === 'connected' ? (
          <TouchableOpacity
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); disconnect(); }}
            style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6, borderWidth: 1, borderColor: theme.destructive + '88', backgroundColor: theme.destructive + '18' }}
          >
            <Text style={{ color: theme.destructive, fontSize: 12, fontFamily: 'Inter_600SemiBold' }}>Disconnect</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); connect(); }}
            style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6, borderWidth: 1, borderColor: MEMORY_COLOR, backgroundColor: MEMORY_DIM }}
          >
            <Text style={{ color: MEMORY_COLOR, fontSize: 12, fontFamily: 'Inter_600SemiBold' }}>Connect</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Tool chips when connected */}
      {status === 'connected' && tools.length > 0 && (
        <View style={{ marginTop: 10, marginBottom: 4 }}>
          <Text style={{ color: MEMORY_COLOR, fontSize: 10, fontFamily: 'Inter_600SemiBold', letterSpacing: 1, marginBottom: 6 }}>
            {tools.length} MEMORY TOOLS AVAILABLE
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {tools.map((t) => (
                <View key={t.name} style={{ backgroundColor: MEMORY_DIM, borderWidth: 1, borderColor: MEMORY_GLOW, borderRadius: 4, paddingHorizontal: 8, paddingVertical: 4 }}>
                  <Text style={{ color: MEMORY_COLOR, fontSize: 10, fontFamily: 'Inter_400Regular' }}>{t.name}</Text>
                </View>
              ))}
            </View>
          </ScrollView>
        </View>
      )}

      {/* Error */}
      {errorMsg && (
        <Text style={{ color: theme.destructive, fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: 6 }}>
          {errorMsg}
        </Text>
      )}

      {/* Config fields — hidden when connected */}
      {status !== 'connected' && (
        <>
          <Text style={labelStyle}>MEMORY MACHINE URL</Text>
          <TextInput
            style={inputStyle}
            value={config.url}
            onChangeText={(v) => updateConfig({ url: v })}
            placeholder="https://your-memory-machine.replit.app/api/mcp"
            placeholderTextColor={theme.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />

          <Text style={labelStyle}>MCP TOKEN</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <TextInput
              style={[inputStyle, { flex: 1 }]}
              value={config.token}
              onChangeText={(v) => updateConfig({ token: v })}
              placeholder="Paste from Memory Machine Settings → Memory Bridge"
              placeholderTextColor={theme.textMuted}
              secureTextEntry={!showToken}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TouchableOpacity onPress={() => setShowToken((v) => !v)} style={{ padding: 8, marginTop: 6 }}>
              <Feather name={showToken ? 'eye-off' : 'eye'} size={16} color={theme.textMuted} />
            </TouchableOpacity>
          </View>
        </>
      )}

      <Text style={{ color: theme.textMuted, fontSize: 10, fontFamily: 'Inter_400Regular', marginTop: 12, lineHeight: 16 }}>
        Gives Leo persistent memory across all conversations. Token from Memory Machine → Settings → Memory Bridge.
      </Text>
    </View>
  );
}
