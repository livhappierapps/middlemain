import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { useState } from 'react';
import { ActivityIndicator, Modal, Platform, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useMCP } from '@/context/MCPContext';
import { useTheme } from '@/context/ThemeContext';

const MEMORY_COLOR = '#a78bfa';
const MEMORY_DIM = '#a78bfa33';
const MEMORY_GLOW = '#a78bfa66';

type ToolInputProperty = {
  type?: string;
  description?: string;
  enum?: unknown[];
  example?: unknown;
  default?: unknown;
};

function exampleValue(name: string, schema: ToolInputProperty): unknown {
  if (schema.example !== undefined) return schema.example;
  if (schema.default !== undefined) return schema.default;
  if (schema.enum?.length) return schema.enum[0];
  switch (schema.type) {
    case 'string': return `<${name}>`;
    case 'integer':
    case 'number': return 0;
    case 'boolean': return false;
    case 'array': return [];
    case 'object': return {};
    default: return `<${name}>`;
  }
}

export function MemoryMachineCard() {
  const { theme } = useTheme();
  const {
    config, updateConfig, status, errorMsg, credentialStorageReady, credentialStorageError,
    tools, connect, disconnect,
  } = useMCP();
  const storageBlocked = !credentialStorageReady || !!credentialStorageError;
  const [showToken, setShowToken] = useState(false);
  const [helpToolName, setHelpToolName] = useState<string | null>(null);
  const helpTool = tools.find((tool) => tool.name === helpToolName) ?? null;
  const helpProperties = Object.entries(
    (helpTool?.inputSchema?.properties ?? {}) as Record<string, ToolInputProperty>,
  );
  const requiredInputs = helpTool?.inputSchema?.required ?? [];
  const exampleInput = Object.fromEntries(
    requiredInputs.map((name) => {
      const schema = helpProperties.find(([propertyName]) => propertyName === name)?.[1];
      return [name, schema ? exampleValue(name, schema) : `<${name}>`];
    }),
  );
  const documentedProperties = [
    ...helpProperties,
    ...requiredInputs
      .filter((requiredName) => !helpProperties.some(([name]) => name === requiredName))
      .map((name) => [name, {} as ToolInputProperty] as [string, ToolInputProperty]),
  ];

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
            disabled={storageBlocked}
            style={{ paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6, borderWidth: 1, borderColor: MEMORY_COLOR, backgroundColor: MEMORY_DIM, opacity: storageBlocked ? 0.45 : 1 }}
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
                <View key={t.name} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: MEMORY_DIM, borderWidth: 1, borderColor: MEMORY_GLOW, borderRadius: 4, paddingLeft: 8, paddingRight: 4, gap: 4 }}>
                  <Text style={{ color: MEMORY_COLOR, fontSize: 10, fontFamily: 'Inter_400Regular' }}>{t.name}</Text>
                  <TouchableOpacity
                    onPress={() => setHelpToolName(t.name)}
                    accessibilityRole="button"
                    accessibilityLabel={`How to use ${t.name}`}
                    style={{ padding: 5 }}
                  >
                    <Feather name="help-circle" size={14} color={MEMORY_COLOR} />
                  </TouchableOpacity>
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
      {credentialStorageError ? (
        <Text style={{ color: theme.destructive, fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: 6 }}>
          {credentialStorageError}
        </Text>
      ) : !credentialStorageReady ? (
        <Text style={{ color: theme.textMuted, fontSize: 11, fontFamily: 'Inter_400Regular', marginTop: 6 }}>
          Securing saved Memory Machine settings…
        </Text>
      ) : Platform.OS === 'web' ? (
        <Text style={{ color: theme.textMuted, fontSize: 10, fontFamily: 'Inter_400Regular', marginTop: 6 }}>
          Browser preview keeps this token in memory for this session only.
        </Text>
      ) : null}

      {/* Config fields — hidden when connected */}
      {status !== 'connected' && (
        <>
          <Text style={labelStyle}>MEMORY MACHINE URL</Text>
          <TextInput
            style={inputStyle}
            value={config.url}
            onChangeText={(v) => updateConfig({ url: v })}
            editable={!storageBlocked}
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
              editable={!storageBlocked}
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
        Connects the memory tools listed above. Each tool's help shows the description and inputs advertised by that service.
      </Text>

      <Modal
        visible={!!helpTool}
        transparent
        animationType="fade"
        onRequestClose={() => setHelpToolName(null)}
      >
        <View style={{ flex: 1, justifyContent: 'center', padding: 20, backgroundColor: '#000000AA' }}>
          <View style={{ maxHeight: '82%', backgroundColor: theme.background, borderColor: theme.border, borderWidth: 1, borderRadius: theme.radius, padding: 18 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
              <Text accessibilityRole="header" style={{ flex: 1, color: theme.text, fontFamily: 'Inter_700Bold', fontSize: 16 }}>
                {helpTool?.name ?? 'Tool help'}
              </Text>
              <TouchableOpacity
                onPress={() => setHelpToolName(null)}
                accessibilityRole="button"
                accessibilityLabel="Close tool help"
                hitSlop={10}
              >
                <Feather name="x" size={21} color={theme.textMuted} />
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator>
              <Text style={{ color: theme.text, fontFamily: 'Inter_400Regular', fontSize: 13, lineHeight: 19, marginBottom: 14 }}>
                {helpTool?.description || 'This tool did not provide a description.'}
              </Text>
              <Text style={{ color: MEMORY_COLOR, fontFamily: 'Inter_600SemiBold', fontSize: 11, letterSpacing: 1, marginBottom: 8 }}>
                INPUTS FROM THE TOOL SCHEMA
              </Text>
              {documentedProperties.length ? documentedProperties.map(([name, schema]) => (
                <View key={name} style={{ marginBottom: 10 }}>
                  <Text style={{ color: theme.text, fontFamily: 'Inter_600SemiBold', fontSize: 12 }}>
                    {name} · {requiredInputs.includes(name) ? 'required' : 'optional'}
                    {schema.type ? ` · ${schema.type}` : ''}
                    {!schema.type && requiredInputs.includes(name) ? ' · type not provided' : ''}
                  </Text>
                  {schema.description ? (
                    <Text style={{ color: theme.textMuted, fontFamily: 'Inter_400Regular', fontSize: 11, lineHeight: 16, marginTop: 2 }}>
                      {schema.description}
                    </Text>
                  ) : null}
                </View>
              )) : (
                <Text style={{ color: theme.textMuted, fontFamily: 'Inter_400Regular', fontSize: 12, lineHeight: 18, marginBottom: 12 }}>
                  No input fields are listed in this tool's schema.
                </Text>
              )}
              <Text style={{ color: theme.textMuted, fontFamily: 'Inter_400Regular', fontSize: 10, lineHeight: 15, marginBottom: 8 }}>
                Required by the advertised schema: {requiredInputs.length ? requiredInputs.join(', ') : 'none listed'}
              </Text>
              {helpTool?.inputSchema ? (
                <>
                  <Text style={{ color: MEMORY_COLOR, fontFamily: 'Inter_600SemiBold', fontSize: 10, letterSpacing: 1, marginBottom: 5 }}>
                    FULL ADVERTISED SCHEMA
                  </Text>
                  <Text selectable style={{ color: theme.textMuted, backgroundColor: theme.surface, borderRadius: 6, padding: 9, fontFamily: 'monospace', fontSize: 9, lineHeight: 14, marginBottom: 8 }}>
                    {JSON.stringify(helpTool.inputSchema, null, 2)}
                  </Text>
                </>
              ) : null}
              <Text style={{ color: MEMORY_COLOR, fontFamily: 'Inter_600SemiBold', fontSize: 11, letterSpacing: 1, marginTop: 8, marginBottom: 6 }}>
                EXAMPLE INPUT
              </Text>
              <Text selectable style={{ color: theme.text, backgroundColor: theme.surface, borderRadius: 6, padding: 10, fontFamily: 'monospace', fontSize: 11, lineHeight: 17 }}>
                {JSON.stringify(exampleInput, null, 2)}
              </Text>
              <Text style={{ color: theme.textMuted, fontFamily: 'Inter_400Regular', fontSize: 10, lineHeight: 15, marginTop: 7 }}>
                Example values are placeholders based on the schema. Replace them with values that fit your request.
              </Text>
            </ScrollView>
            <TouchableOpacity
              onPress={() => setHelpToolName(null)}
              accessibilityRole="button"
              style={{ alignSelf: 'flex-end', marginTop: 14, paddingVertical: 8, paddingHorizontal: 14, borderWidth: 1, borderColor: MEMORY_COLOR, borderRadius: 7 }}
            >
              <Text style={{ color: MEMORY_COLOR, fontFamily: 'Inter_600SemiBold', fontSize: 12 }}>Close</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}
