import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { useState } from 'react';
import { ActivityIndicator, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useAisAndEars } from '@/context/AisAndEarsContext';
import { useTheme } from '@/context/ThemeContext';

export function AisAndEarsBridgeCard() {
  const { theme } = useTheme();
  const {
    config, updateConfig,
    status, errorMsg, credentialStorageReady, credentialStorageError, session,
    connect, disconnect,
  } = useAisAndEars();

  const [showKey, setShowKey] = useState(false);

  const statusColor = {
    idle: theme.textMuted,
    connecting: theme.secondary,
    connected: '#00ff88',
    error: theme.destructive,
  }[status];

  const statusLabel = {
    idle: 'NOT CONNECTED',
    connecting: 'CONNECTING…',
    connected: 'BRIDGE ACTIVE',
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
      borderColor: status === 'connected' ? '#00ff8866' : theme.border,
      borderRadius: theme.radius,
      padding: 16,
      shadowColor: status === 'connected' ? '#00ff88' : theme.primary,
      shadowOffset: { width: 0, height: 0 },
      shadowRadius: 10,
      shadowOpacity: status === 'connected' ? 0.3 : 0.1,
      elevation: 4,
    }}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: '#00ff8822', alignItems: 'center', justifyContent: 'center' }}>
            <Feather name="radio" size={16} color="#00ff88" />
          </View>
          <View>
            <Text style={{ color: theme.text, fontSize: 14, fontFamily: 'Inter_600SemiBold' }}>
              AIs & Ears Bridge
            </Text>
            <Text style={{ color: statusColor, fontSize: 10, fontFamily: 'Inter_600SemiBold', letterSpacing: 1 }}>
              {statusLabel}
            </Text>
          </View>
        </View>

        {status === 'connecting' ? (
          <ActivityIndicator size="small" color={theme.secondary} />
        ) : status === 'connected' ? (
          <TouchableOpacity
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); disconnect(); }}
            style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6, borderWidth: 1, borderColor: theme.destructive + '88', backgroundColor: theme.destructive + '18' }}
          >
            <Text style={{ color: theme.destructive, fontSize: 12, fontFamily: 'Inter_600SemiBold' }}>Disconnect</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            disabled={!credentialStorageReady}
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); connect(); }}
            style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6, borderWidth: 1, borderColor: '#00ff88', backgroundColor: '#00ff8818', opacity: credentialStorageReady ? 1 : 0.45 }}
          >
            <Text style={{ color: '#00ff88', fontSize: 12, fontFamily: 'Inter_600SemiBold' }}>Connect</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Session info */}
      {session && (
        <View style={{ backgroundColor: '#00ff8810', borderRadius: 6, padding: 8, marginTop: 8, marginBottom: 4 }}>
          <Text style={{ color: '#00ff88', fontSize: 11, fontFamily: 'Inter_400Regular', fontStyle: 'italic' }}>
            Session: {session.sessionId.slice(0, 16)}… · expires {new Date(session.expiresAt).toLocaleTimeString()}
          </Text>
        </View>
      )}

      {/* Error */}
      {errorMsg && (
        <Text style={{ color: theme.destructive, fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: 6 }}>
          {errorMsg}
        </Text>
      )}
      {credentialStorageError && (
        <Text accessibilityRole="alert" style={{ color: theme.destructive, fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: 6 }}>
          {credentialStorageError}
        </Text>
      )}
      {!credentialStorageReady && !credentialStorageError && (
        <Text style={{ color: theme.textMuted, fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: 6 }}>
          Securing saved bridge settings…
        </Text>
      )}

      {/* Config fields — hidden when connected */}
      {status !== 'connected' && (
        <>
          <Text style={labelStyle}>AIs & EARS APP URL</Text>
          <TextInput
            style={inputStyle}
            value={config.domain}
            editable={credentialStorageReady}
            onChangeText={(v) => updateConfig({ domain: v })}
            placeholder="https://your-ais-and-ears.replit.app"
            placeholderTextColor={theme.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />

          <Text style={labelStyle}>BRIDGE API KEY</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <TextInput
              style={[inputStyle, { flex: 1 }]}
              value={config.apiKey}
              editable={credentialStorageReady}
              onChangeText={(v) => updateConfig({ apiKey: v })}
              placeholder="bridge_..."
              placeholderTextColor={theme.textMuted}
              secureTextEntry={!showKey}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <TouchableOpacity disabled={!credentialStorageReady} onPress={() => setShowKey((v) => !v)} style={{ padding: 8, marginTop: 6 }}>
              <Feather name={showKey ? 'eye-off' : 'eye'} size={16} color={theme.textMuted} />
            </TouchableOpacity>
          </View>

          <Text style={labelStyle}>SESSION DURATION</Text>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
            {[15, 30, 60].map((m) => (
              <TouchableOpacity
                key={m}
                disabled={!credentialStorageReady}
                onPress={() => updateConfig({ durationMinutes: m })}
                style={{
                  paddingHorizontal: 16, paddingVertical: 7, borderRadius: 6,
                  borderWidth: 1,
                  borderColor: config.durationMinutes === m ? '#00ff88' : theme.border,
                  backgroundColor: config.durationMinutes === m ? '#00ff8818' : 'transparent',
                  opacity: credentialStorageReady ? 1 : 0.45,
                }}
              >
                <Text style={{ color: config.durationMinutes === m ? '#00ff88' : theme.textMuted, fontSize: 12, fontFamily: 'Inter_600SemiBold' }}>
                  {m}m
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </>
      )}

      <Text style={{ color: theme.textMuted, fontSize: 10, fontFamily: 'Inter_400Regular', marginTop: 12, lineHeight: 16 }}>
        Sends camera, screen, or microphone input through AIs & Ears. Connect here, then choose which inputs to share in Bridge.
      </Text>
    </View>
  );
}
