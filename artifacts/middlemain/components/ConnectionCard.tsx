import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { AIConnection, PROVIDER_DEFAULTS, useAI } from '@/context/AIContext';
import { useTheme } from '@/context/ThemeContext';

interface ConnectionCardProps {
  connection: AIConnection;
  onEdit: (conn: AIConnection) => void;
  onTest: (id: string) => void;
  testing?: boolean;
}

const STATUS_COLORS: Record<string, string> = {
  ok: '#00ff88',
  error: '#ff4466',
  untested: '#888888',
};

export function ConnectionCard({ connection, onEdit, onTest, testing }: ConnectionCardProps) {
  const { theme } = useTheme();
  const { deleteConnection, setActiveConnection } = useAI();

  const statusColor = STATUS_COLORS[connection.testStatus ?? 'untested'];
  const providerLabel = PROVIDER_DEFAULTS[connection.provider]?.label ?? 'Custom';

  return (
    <View
      style={{
        backgroundColor: theme.card,
        borderRadius: theme.radius,
        borderWidth: 1,
        borderColor: connection.isActive ? theme.primary : theme.border,
        padding: 14,
        marginHorizontal: 16,
        marginBottom: 10,
        shadowColor: connection.isActive ? theme.primary : 'transparent',
        shadowOffset: { width: 0, height: 0 },
        shadowRadius: 8,
        shadowOpacity: 0.5,
        elevation: connection.isActive ? 6 : 2,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View
              style={{
                width: 8,
                height: 8,
                borderRadius: 4,
                backgroundColor: statusColor,
                shadowColor: statusColor,
                shadowOffset: { width: 0, height: 0 },
                shadowRadius: 6,
                shadowOpacity: 0.9,
              }}
            />
            <Text style={{ color: theme.text, fontSize: 15, fontFamily: 'Inter_600SemiBold' }}>
              {connection.name}
            </Text>
            {connection.isActive && (
              <View style={{ backgroundColor: theme.primary + '33', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}>
                <Text style={{ color: theme.primary, fontSize: 9, fontFamily: 'Inter_600SemiBold', letterSpacing: 1 }}>
                  ACTIVE
                </Text>
              </View>
            )}
          </View>
          <Text style={{ color: theme.textMuted, fontSize: 12, fontFamily: 'Inter_400Regular', marginTop: 4 }}>
            {providerLabel} · {connection.model}
          </Text>
          {connection.lastTested && (
            <Text style={{ color: theme.textMuted, fontSize: 10, fontFamily: 'Inter_400Regular', marginTop: 2 }}>
              Tested {new Date(connection.lastTested).toLocaleString()}
            </Text>
          )}
        </View>

        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
          <TouchableOpacity
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              onTest(connection.id);
            }}
            style={{ padding: 8 }}
          >
            <Feather name={testing ? 'loader' : 'activity'} size={18} color={theme.secondary} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setActiveConnection(connection.id);
            }}
            style={{ padding: 8 }}
          >
            <Feather name="zap" size={18} color={connection.isActive ? theme.primary : theme.textMuted} />
          </TouchableOpacity>
          <TouchableOpacity onPress={() => onEdit(connection)} style={{ padding: 8 }}>
            <Feather name="edit-2" size={18} color={theme.textMuted} />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}
