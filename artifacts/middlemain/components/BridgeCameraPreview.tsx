import { CameraView, useCameraPermissions } from 'expo-camera';
import * as FileSystem from 'expo-file-system/legacy';
import { useFocusEffect } from 'expo-router';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, AppState, Image, Linking, Text, TouchableOpacity, View } from 'react-native';
import { useTheme } from '@/context/ThemeContext';

interface Props {
  sendFrame: (image: string, source: 'camera', signal?: AbortSignal) => Promise<string | null>;
  onError: (message: string) => void;
}

export function BridgeCameraPreview({ sendFrame, onError }: Props) {
  const { theme } = useTheme();
  const [permission, requestPermission] = useCameraPermissions();
  const [focused, setFocused] = useState(false);
  const [foreground, setForeground] = useState(AppState.currentState === 'active');
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [live, setLive] = useState(false);
  const [lastImage, setLastImage] = useState<string | null>(null);
  const [status, setStatus] = useState('Preview only — nothing has been sent.');
  const camera = useRef<CameraView>(null);
  const asked = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const liveRef = useRef(false);
  const mounted = useRef(true);
  const inFlight = useRef(false);
  const active = useRef(false);
  const sendRef = useRef(sendFrame);
  const errorRef = useRef(onError);
  sendRef.current = sendFrame;
  errorRef.current = onError;
  active.current = focused && foreground && ready;

  const stop = useCallback(() => {
    liveRef.current = false;
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    controller.current?.abort();
    if (mounted.current) {
      setLive(false);
      setLastImage(null);
      setStatus('Sharing stopped. A frame already received by the bridge cannot be recalled.');
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; stop(); };
  }, [stop]);

  useFocusEffect(useCallback(() => {
    setFocused(true);
    return () => { setFocused(false); setReady(false); stop(); };
  }, [stop]));

  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      const active = state === 'active';
      setForeground(active);
      if (!active) { setReady(false); stop(); }
    });
    return () => subscription.remove();
  }, [stop]);

  useEffect(() => {
    if (!permission || permission.granted || !permission.canAskAgain || asked.current) return;
    asked.current = true;
    void requestPermission().catch(() => setStatus('Could not request camera access. Use the permission button below.'));
  }, [permission, requestPermission]);

  const sendOne = async () => {
    if (!camera.current || !active.current || inFlight.current || !mounted.current) return;
    inFlight.current = true;
    setBusy(true);
    const current = new AbortController();
    controller.current = current;
    let stage: 'capture' | 'upload' = 'capture';
    try {
      setStatus('Capturing a frame…');
      const photo = await camera.current.takePictureAsync({ base64: true, quality: 0.35, shutterSound: false });
      const image = photo?.base64 ? `data:image/jpeg;base64,${photo.base64}` : null;
      // Keep only an in-memory thumbnail; do not leave camera files in the cache.
      if (photo?.uri) await FileSystem.deleteAsync(photo.uri, { idempotent: true }).catch(() => {});
      if (current.signal.aborted || !mounted.current) return;
      if (!image) throw new Error('No camera image was returned.');
      setLastImage(image);
      setStatus('Captured locally. Uploading one frame to your bridge…');
      stage = 'upload';
      const reply = await sendRef.current(image, 'camera', current.signal);
      if (current.signal.aborted || !mounted.current) return;
      setStatus(reply
        ? 'Bridge accepted the frame and returned an AI reply below.'
        : 'Bridge accepted the frame but returned no AI description. Check the bridge service.');
      if (!reply) { liveRef.current = false; setLive(false); }
    } catch (error) {
      if (current.signal.aborted || !mounted.current) return;
      const message = stage === 'capture'
        ? 'Camera capture failed. Check camera permissions, keep Bridge open, and try one frame again.'
        : error instanceof Error ? error.message : 'Image delivery could not be confirmed.';
      liveRef.current = false;
      setLive(false);
      setStatus(`${message} Live sharing is paused.`);
      errorRef.current(message);
    } finally {
      inFlight.current = false;
      if (controller.current === current) controller.current = null;
      if (mounted.current) setBusy(false);
      // Start the next capture only AFTER the preceding upload finishes.
      if (liveRef.current && !current.signal.aborted && mounted.current) {
        timer.current = setTimeout(() => { void sendOne(); }, 3000);
      }
    }
  };

  const confirmSend = (continuous: boolean) => Alert.alert(
    continuous ? 'Start live camera sharing?' : 'Send one camera frame?',
    continuous
      ? 'Images go to your configured AIs & Ears bridge. Each accepted image may incur bridge/provider charges. The next frame is captured 3 seconds after the previous request finishes. Stop live or turn Cam off when finished.'
      : 'One image goes to your configured AIs & Ears bridge, not directly through the selected chat connection. This may incur bridge/provider charges. No automatic retry is made.',
    [
      { text: 'Cancel', style: 'cancel' },
      { text: continuous ? 'Start live' : 'Send one frame', onPress: () => {
        if (!mounted.current || !active.current || inFlight.current) return;
        liveRef.current = continuous;
        setLive(continuous);
        void sendOne();
      } },
    ],
  );

  const buttonStyle = { padding: 10, borderWidth: 1, borderColor: theme.primary, borderRadius: theme.radius } as const;
  return (
    <View style={{ padding: 10, backgroundColor: theme.surface, borderBottomWidth: 1, borderBottomColor: theme.border }}>
      {permission?.granted && focused && foreground ? (
        <CameraView
          ref={camera}
          facing="front"
          style={{ height: 110, borderRadius: theme.radius, overflow: 'hidden' }}
          onCameraReady={() => { setReady(true); setStatus('Camera ready. Preview only — tap Send one frame to test.'); }}
          onMountError={() => { setReady(false); stop(); setStatus('Camera could not start. Check permissions or close other camera apps.'); errorRef.current('Camera could not start.'); }}
        />
      ) : permission?.granted ? (
        <Text style={{ color: theme.text }}>Camera paused while Bridge is not active.</Text>
      ) : (
        <TouchableOpacity
          style={buttonStyle}
          accessibilityRole="button"
          onPress={() => {
            if (permission?.canAskAgain) void requestPermission().catch(() => setStatus('Camera permission request failed.'));
            else void Linking.openSettings().catch(() => setStatus('Open iPhone or Android Settings and allow Camera for Middlemain.'));
          }}
        >
          <Text style={{ color: theme.text }}>{permission?.canAskAgain ? 'Allow camera access' : 'Open camera permission settings'}</Text>
        </TouchableOpacity>
      )}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 }}>
        {lastImage && <Image source={{ uri: lastImage }} accessibilityLabel="Last locally captured camera frame" style={{ width: 42, height: 42, borderRadius: 6 }} />}
        <Text accessibilityLiveRegion="polite" style={{ flex: 1, color: theme.text, fontSize: 12 }}>{status}</Text>
      </View>
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
        <TouchableOpacity style={[buttonStyle, { opacity: ready && !busy && !live ? 1 : 0.4 }]} accessibilityRole="button" disabled={!ready || busy || live} onPress={() => confirmSend(false)}>
          <Text style={{ color: theme.primary }}>Send one frame</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[buttonStyle, { opacity: live || (ready && !busy) ? 1 : 0.4 }]} accessibilityRole="button" disabled={!live && (!ready || busy)} onPress={() => live ? stop() : confirmSend(true)}>
          <Text style={{ color: theme.primary }}>{live ? 'Stop live' : 'Start live'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
