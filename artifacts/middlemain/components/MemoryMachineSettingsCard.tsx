import { Feather } from '@expo/vector-icons';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Haptics from 'expo-haptics';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { NeonButton } from '@/components/NeonButton';
import { NeonCard } from '@/components/NeonCard';
import { useMemoryAuth } from '@/context/MemoryAuthContext';
import { useTheme } from '@/context/ThemeContext';
import {
  isValidMemoryMachineUrl,
  loadMemoryMachineSettings,
  pushMemoryConfigToServer,
  saveMemoryMachineSettings,
  testMemoryMachine,
} from '@/utils/memoryMachineSettings';

// Brand lock: pink is always paired with turquoise.
const PINK = '#FF2EA6';
const TURQUOISE = '#00F0DC';

/**
 * Settings → Memory Machine. The two fields from the spec (URL + one service
 * key), a Test connection button (GET /healthz), and the one-time Sign in with
 * Apple that lets server Grok read YOUR memories with your own Clerk session.
 */
export function MemoryMachineSettingsCard() {
  const { theme } = useTheme();
  const auth = useMemoryAuth();
  const [url, setUrl] = useState('');
  const [serviceKey, setServiceKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState<'test' | 'save' | 'apple' | null>(null);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  useEffect(() => {
    loadMemoryMachineSettings()
      .then((s) => { setUrl(s.url); setServiceKey(s.serviceKey); })
      .finally(() => setLoaded(true));
  }, []);

  const input = {
    backgroundColor: theme.surface + 'CC',
    borderWidth: 1,
    borderColor: theme.border,
    borderRadius: theme.radius,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: theme.text,
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
  } as const;
  const label = { color: TURQUOISE, fontSize: 10, fontFamily: 'Inter_600SemiBold', letterSpacing: 1.5, marginTop: 12, marginBottom: 6 } as const;
  const help = { color: theme.textMuted, fontSize: 11, fontFamily: 'Inter_400Regular', lineHeight: 16, marginTop: 4 } as const;

  const onTest = async () => {
    setBusy('test');
    setResult(null);
    const r = await testMemoryMachine({ url, serviceKey });
    setResult({ ok: r.reachable && r.keyAccepted !== false, message: r.message });
    Haptics.notificationAsync(r.reachable ? Haptics.NotificationFeedbackType.Success : Haptics.NotificationFeedbackType.Error);
    setBusy(null);
  };

  const onSave = async () => {
    if (url.trim() && !isValidMemoryMachineUrl(url)) {
      Alert.alert('Check the URL', 'The Memory Machine URL must start with https://');
      return;
    }
    setBusy('save');
    setResult(null);
    try {
      await saveMemoryMachineSettings({ url, serviceKey });
      setResult(await pushMemoryConfigToServer({ url, serviceKey }));
    } catch {
      setResult({ ok: false, message: 'Could not save the service key in secure storage on this device.' });
    }
    setBusy(null);
  };

  const onApple = async () => {
    setBusy('apple');
    try {
      await auth.signInWithApple();
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err) {
      const code = (err as { code?: string })?.code;
      if (code !== 'ERR_REQUEST_CANCELED') Alert.alert('Sign in with Apple', 'Sign in did not finish. Try again.');
    }
    setBusy(null);
  };

  return (
    <NeonCard style={{ marginHorizontal: 16, marginBottom: 4 }} accentColor={PINK}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <Feather name="database" size={18} color={PINK} />
        <Text style={{ color: PINK, fontSize: 14, fontFamily: 'Inter_600SemiBold' }}>Memory Machine</Text>
        <Text style={{ color: TURQUOISE, fontSize: 10, fontFamily: 'Inter_600SemiBold', letterSpacing: 1 }}>AUTO MEMORY</Text>
      </View>
      <Text style={{ color: theme.textMuted, fontSize: 12, fontFamily: 'Inter_400Regular', lineHeight: 18 }}>
        Lets server Grok remember you. Before each Grok reply, Middlemain looks up your most relevant memories and your standing
        profile and adds them as background. If Memory Machine is down, chat keeps working without it.
      </Text>

      {/* One-time sign in */}
      <Text style={label}>YOUR ACCOUNT</Text>
      {!auth.available ? (
        <Text style={help}>Sign in with Apple isn't switched on in this build yet. The service key below still works for your own account.</Text>
      ) : !auth.loaded ? (
        <ActivityIndicator color={TURQUOISE} />
      ) : auth.signedIn ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={{ color: TURQUOISE, fontSize: 12, fontFamily: 'Inter_600SemiBold' }}>✓ Signed in. Your memories are used automatically.</Text>
          <TouchableOpacity onPress={() => void auth.signOut()} accessibilityRole="button">
            <Text style={{ color: PINK, fontSize: 12, fontFamily: 'Inter_600SemiBold' }}>Sign out</Text>
          </TouchableOpacity>
        </View>
      ) : auth.appleAvailable && Platform.OS === 'ios' ? (
        <AppleAuthentication.AppleAuthenticationButton
          buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
          buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
          cornerRadius={theme.radius}
          style={{ height: 44, width: '100%', opacity: busy === 'apple' ? 0.5 : 1 }}
          onPress={() => { if (!busy) void onApple(); }}
        />
      ) : (
        <Text style={help}>Sign in with Apple is available on iPhone.</Text>
      )}

      <Text style={label}>MEMORY MACHINE URL</Text>
      <TextInput
        value={url}
        onChangeText={setUrl}
        editable={loaded}
        placeholder="https://memory-machine-api.onrender.com"
        placeholderTextColor={theme.textMuted}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        accessibilityLabel="Memory Machine URL"
        style={input}
      />
      <Text style={help}>The web address of your Memory Machine server (not the MCP link on the Connect tab).</Text>

      <Text style={label}>SERVICE KEY</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <TextInput
          value={serviceKey}
          onChangeText={setServiceKey}
          editable={loaded}
          placeholder="Paste the Memory Machine service key"
          placeholderTextColor={theme.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry={!showKey}
          accessibilityLabel="Memory Machine service key"
          style={[input, { flex: 1 }]}
        />
        <TouchableOpacity onPress={() => setShowKey((v) => !v)} accessibilityLabel={showKey ? 'Hide key' : 'Show key'} style={{ padding: 6 }}>
          <Feather name={showKey ? 'eye-off' : 'eye'} size={18} color={TURQUOISE} />
        </TouchableOpacity>
      </View>
      <Text style={help}>
        Stored only in this iPhone's secure storage and sent to your Middlemain server, which uses it for the nightly profile
        rebuild and when you're not signed in. Never shared with any AI.
      </Text>

      <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
        <NeonButton label={busy === 'test' ? 'Testing…' : 'Test connection'} variant="secondary" size="sm" onPress={onTest} disabled={!!busy || !url.trim()} />
        <NeonButton label={busy === 'save' ? 'Saving…' : 'Save'} size="sm" onPress={onSave} disabled={!!busy || !loaded} />
      </View>
      {result && (
        <Text style={{ color: result.ok ? TURQUOISE : PINK, fontSize: 12, fontFamily: 'Inter_500Medium', marginTop: 10, lineHeight: 17 }}>
          {result.ok ? '✓ ' : '⚠ '}{result.message}
        </Text>
      )}
    </NeonCard>
  );
}
