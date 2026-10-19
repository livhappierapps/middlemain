import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Clipboard from 'expo-clipboard';
import * as SecureStore from 'expo-secure-store';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTheme } from '@/context/ThemeContext';

const METADATA_KEY = '@middlemain_human_hands_vault_v1';
const SECRET_KEY_PREFIX = 'middlemain_human_hands_secret_';
const MAX_SECRETS = 30;

const SECRET_KINDS = [
  { id: 'password', label: 'Password' },
  { id: 'api-key', label: 'API key' },
  { id: 'token', label: 'Access token' },
  { id: 'recovery-code', label: 'Recovery code' },
  { id: 'other', label: 'Other' },
] as const;

type SecretKind = (typeof SECRET_KINDS)[number]['id'];

interface SecretMetadata {
  id: string;
  label: string;
  service: string;
  kind: SecretKind;
}

type AppTheme = ReturnType<typeof useTheme>['theme'];

function stylesFor(theme: AppTheme) {
  return StyleSheet.create({
    section: {
      backgroundColor: theme.card,
      borderColor: theme.border,
      borderRadius: theme.radius,
      borderWidth: 1,
      marginTop: 14,
      padding: 15,
    },
    sectionTitle: {
      color: theme.text,
      fontFamily: 'Inter_600SemiBold',
      fontSize: 16,
    },
    body: {
      color: theme.textMuted,
      fontFamily: 'Inter_400Regular',
      fontSize: 12,
      lineHeight: 18,
      marginTop: 7,
    },
    label: {
      color: theme.textMuted,
      fontFamily: 'Inter_600SemiBold',
      fontSize: 10,
      letterSpacing: 1.1,
      marginBottom: 5,
      marginTop: 13,
    },
    input: {
      backgroundColor: theme.surface,
      borderColor: theme.border,
      borderRadius: theme.radius,
      borderWidth: 1,
      color: theme.text,
      fontFamily: 'Inter_400Regular',
      fontSize: 14,
      minHeight: 45,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    multiline: { minHeight: 86, textAlignVertical: 'top' as const },
    row: { alignItems: 'center' as const, flexDirection: 'row' as const, gap: 8 },
    chips: { flexDirection: 'row' as const, flexWrap: 'wrap' as const, gap: 7, marginTop: 8 },
    chip: {
      borderColor: theme.border,
      borderRadius: 18,
      borderWidth: 1,
      paddingHorizontal: 10,
      paddingVertical: 7,
    },
    button: {
      alignItems: 'center' as const,
      backgroundColor: theme.primary,
      borderRadius: theme.radius,
      flexDirection: 'row' as const,
      gap: 8,
      justifyContent: 'center' as const,
      minHeight: 44,
      marginTop: 14,
      paddingHorizontal: 14,
    },
    secondaryButton: {
      alignItems: 'center' as const,
      borderColor: theme.border,
      borderRadius: theme.radius,
      borderWidth: 1,
      flexDirection: 'row' as const,
      gap: 7,
      justifyContent: 'center' as const,
      minHeight: 40,
      paddingHorizontal: 11,
    },
    buttonText: { color: theme.background, fontFamily: 'Inter_600SemiBold', fontSize: 13 },
    secondaryText: { color: theme.text, fontFamily: 'Inter_600SemiBold', fontSize: 12 },
    card: {
      backgroundColor: theme.surface,
      borderColor: theme.border,
      borderRadius: theme.radius,
      borderWidth: 1,
      marginTop: 9,
      padding: 12,
    },
    itemName: { color: theme.text, flex: 1, fontFamily: 'Inter_600SemiBold', fontSize: 14 },
    itemMeta: { color: theme.textMuted, fontFamily: 'Inter_400Regular', fontSize: 11, marginTop: 4 },
    error: { color: theme.destructive, fontFamily: 'Inter_400Regular', fontSize: 12, marginTop: 10 },
    notice: { color: theme.primary, fontFamily: 'Inter_500Medium', fontSize: 12, marginTop: 9 },
    empty: { alignItems: 'center' as const, paddingVertical: 18 },
    confirmRow: { flexDirection: 'row' as const, gap: 8, marginTop: 10 },
  });
}

function newSecretId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 9)}`;
}

function secureKey(id: string): string {
  return `${SECRET_KEY_PREFIX}${id}`;
}

export function HumanHandsVault() {
  const { theme } = useTheme();
  const styles = useMemo(() => stylesFor(theme), [theme]);
  const [items, setItems] = useState<SecretMetadata[]>([]);
  const [label, setLabel] = useState('');
  const [service, setService] = useState('');
  const [secret, setSecret] = useState('');
  const [kind, setKind] = useState<SecretKind>('password');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const secureStorageAvailable = Platform.OS !== 'web';

  useEffect(() => {
    let current = true;
    AsyncStorage.getItem(METADATA_KEY)
      .then((raw) => {
        if (!current || !raw) return;
        const parsed: unknown = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          const valid = parsed.filter(
            (item): item is SecretMetadata =>
              item &&
              typeof item.id === 'string' &&
              typeof item.label === 'string' &&
              typeof item.service === 'string' &&
              SECRET_KINDS.some((entry) => entry.id === item.kind),
          );
          setItems(valid.slice(0, MAX_SECRETS));
        }
      })
      .catch(() => {
        if (current) setError('Saved vault labels could not be loaded.');
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => { current = false; };
  }, []);

  const saveMetadata = async (next: SecretMetadata[]) => {
    await AsyncStorage.setItem(METADATA_KEY, JSON.stringify(next));
    setItems(next);
  };

  const handleSave = async () => {
    setError('');
    setNotice('');
    if (!secureStorageAvailable) {
      setError('Secret storage is available only in the installed iOS or Android app.');
      return;
    }
    if (!label.trim() || !service.trim() || !secret.trim()) {
      setError('Add a label, service, and secret value.');
      return;
    }
    if (secret.length > 4096) {
      setError('Secret values must be 4,096 characters or fewer.');
      return;
    }
    if (items.length >= MAX_SECRETS) {
      setError(`The vault limit is ${MAX_SECRETS} items.`);
      return;
    }

    const item: SecretMetadata = {
      id: newSecretId(),
      label: label.trim(),
      service: service.trim(),
      kind,
    };
    setSaving(true);
    try {
      const available = await SecureStore.isAvailableAsync();
      if (!available) throw new Error('Secure storage is unavailable on this device.');
      await SecureStore.setItemAsync(secureKey(item.id), secret, {
        requireAuthentication: true,
        authenticationPrompt: 'Authenticate to save this secret',
      });
      await saveMetadata([item, ...items]);
      setLabel('');
      setService('');
      setSecret('');
      setKind('password');
      setNotice('Saved in this phone’s secure storage. It was not sent to an AI.');
    } catch {
      setError('Could not save securely. Check that device authentication is set up, then try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleCopy = async (item: SecretMetadata) => {
    setError('');
    setNotice('');
    if (!secureStorageAvailable) {
      setError('Secret storage is available only in the installed iOS or Android app.');
      return;
    }
    try {
      const value = await SecureStore.getItemAsync(secureKey(item.id), {
        requireAuthentication: true,
        authenticationPrompt: `Authenticate to copy ${item.label}`,
      });
      if (!value) {
        setError('This secret is missing from secure storage. Remove it and save it again.');
        return;
      }
      await Clipboard.setStringAsync(value);
      setNotice(`Copied “${item.label}”. It is now on your system clipboard.`);
    } catch {
      setError('Could not unlock this secret. Try again or re-save it if your device authentication changed.');
    }
  };

  const handleDelete = async (item: SecretMetadata) => {
    setError('');
    setNotice('');
    try {
      await SecureStore.deleteItemAsync(secureKey(item.id));
      await saveMetadata(items.filter((saved) => saved.id !== item.id));
      setConfirmDeleteId(null);
      setNotice(`Deleted “${item.label}” from this device.`);
    } catch {
      setError('Could not delete this secret from secure storage.');
    }
  };

  return (
    <View style={styles.section}>
      <View style={styles.row}>
        <MaterialCommunityIcons name="shield-lock-outline" size={21} color={theme.primary} />
        <Text style={styles.sectionTitle}>Secrets vault</Text>
      </View>
      <Text style={styles.body}>
        Secret values are protected by your phone’s secure storage and device authentication. They stay on this device and are never attached to AI requests or entered into websites automatically.
      </Text>
      <Text style={styles.body}>
        This is not a full password manager: there is no sync, backup, or autofill. Copying puts a secret on the system clipboard, where other apps may be able to read it. Temporary verification codes are not supported.
      </Text>

      {!secureStorageAvailable ? (
        <Text style={styles.error}>Use the installed iOS or Android app to add or unlock vault items. The browser preview does not store secrets.</Text>
      ) : (
        <>
          <Text style={styles.label}>LABEL</Text>
          <TextInput
            value={label}
            onChangeText={setLabel}
            placeholder="Production API key"
            placeholderTextColor={theme.textMuted}
            style={styles.input}
            maxLength={80}
            autoCapitalize="sentences"
          />
          <Text style={styles.label}>SERVICE OR ACCOUNT</Text>
          <TextInput
            value={service}
            onChangeText={setService}
            placeholder="GitHub, Apple, or another service"
            placeholderTextColor={theme.textMuted}
            style={styles.input}
            maxLength={100}
            autoCapitalize="sentences"
          />
          <Text style={styles.label}>SECRET TYPE</Text>
          <View style={styles.chips}>
            {SECRET_KINDS.map((entry) => {
              const selected = kind === entry.id;
              return (
                <Pressable
                  key={entry.id}
                  onPress={() => setKind(entry.id)}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  style={[
                    styles.chip,
                    selected && { borderColor: theme.primary, backgroundColor: theme.primary + '22' },
                  ]}
                >
                  <Text style={{ color: selected ? theme.primary : theme.textMuted, fontFamily: 'Inter_500Medium', fontSize: 11 }}>
                    {entry.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={styles.label}>SECRET VALUE</Text>
          <TextInput
            value={secret}
            onChangeText={setSecret}
            placeholder="Enter it here; it will not be sent to AI"
            placeholderTextColor={theme.textMuted}
            style={[styles.input, styles.multiline]}
            secureTextEntry
            multiline
            maxLength={4096}
            autoCapitalize="none"
            autoCorrect={false}
            textContentType="none"
            importantForAutofill="no"
          />
          <Pressable
            onPress={handleSave}
            disabled={saving || loading || items.length >= MAX_SECRETS}
            accessibilityRole="button"
            style={[styles.button, (saving || loading || items.length >= MAX_SECRETS) && { opacity: 0.5 }]}
          >
            <Feather name="lock" size={15} color={theme.background} />
            <Text style={styles.buttonText}>{saving ? 'Saving securely…' : 'Save in vault'}</Text>
          </Pressable>
        </>
      )}

      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      {notice ? <Text accessibilityLiveRegion="polite" style={styles.notice}>{notice}</Text> : null}

      <Text style={[styles.label, { marginTop: 20 }]}>SAVED ON THIS DEVICE ({items.length}/{MAX_SECRETS})</Text>
      {loading ? (
        <Text style={styles.body}>Loading saved labels…</Text>
      ) : items.length === 0 ? (
        <View style={styles.empty}>
          <Feather name="lock" size={22} color={theme.textMuted} />
          <Text style={styles.body}>No secrets saved yet.</Text>
        </View>
      ) : (
        items.map((item) => (
          <View key={item.id} style={styles.card}>
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.itemName}>{item.label}</Text>
                <Text style={styles.itemMeta}>{item.service} · {SECRET_KINDS.find((entry) => entry.id === item.kind)?.label ?? 'Secret'}</Text>
              </View>
              <Pressable
                onPress={() => handleCopy(item)}
                accessibilityRole="button"
                accessibilityLabel={`Authenticate and copy ${item.label}`}
                style={styles.secondaryButton}
              >
                <Feather name="copy" size={14} color={theme.primary} />
                <Text style={[styles.secondaryText, { color: theme.primary }]}>Copy</Text>
              </Pressable>
            </View>
            {confirmDeleteId === item.id ? (
              <View>
                <Text style={styles.body}>Delete this secret permanently from this device?</Text>
                <View style={styles.confirmRow}>
                  <Pressable onPress={() => handleDelete(item)} style={[styles.secondaryButton, { borderColor: theme.destructive }]}>
                    <Feather name="trash-2" size={14} color={theme.destructive} />
                    <Text style={[styles.secondaryText, { color: theme.destructive }]}>Delete secret</Text>
                  </Pressable>
                  <Pressable onPress={() => setConfirmDeleteId(null)} style={styles.secondaryButton}>
                    <Text style={styles.secondaryText}>Keep it</Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <Pressable
                onPress={() => setConfirmDeleteId(item.id)}
                accessibilityRole="button"
                accessibilityLabel={`Delete ${item.label}`}
                style={{ alignSelf: 'flex-start', marginTop: 11, paddingVertical: 4 }}
              >
                <Text style={[styles.itemMeta, { color: theme.destructive }]}>Delete</Text>
              </Pressable>
            )}
          </View>
        ))
      )}
    </View>
  );
}
