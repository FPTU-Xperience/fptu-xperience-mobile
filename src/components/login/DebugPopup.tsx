// components/login/DebugPopup.tsx
//
// Popup debug TẠM THỜI cho Google Sign-In (xóa khi xong — ghi chú trong
// services/googleDebug.ts). Hiển thị khi màn login active + đã có ≥1 sự kiện,
// hoặc nút "Test One-Tap" chạy promptGoogleSignIn() riêng lẻ (không cần qua
// login) để phân tách: One-Tap fail hay BE từ chối.

import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  addGoogleDebugEvent,
  clearGoogleDebugEvents,
  useGoogleDebugEvents,
  type GoogleDebugEvent,
} from '@/services/googleDebug';
import { getApiErrorMessage } from '@/services/apiClient';
import { promptGoogleSignIn } from '@/services/googleAuth';

type Props = {
  /** Chỉ hiện popup khi màn hình login active (đang render). */
  active: boolean;
};

const LEVEL_COLOR: Record<GoogleDebugEvent['level'], string> = {
  info: '#2563EB',
  error: '#DC2626',
  success: '#15803D',
};

export default function DebugPopup({ active }: Props) {
  const events = useGoogleDebugEvents();
  const [testing, setTesting] = useState(false);

  if (!active || events.length === 0) return null;

  const testOneTap = async () => {
    if (testing) return;
    setTesting(true);
    addGoogleDebugEvent('info', 'Test One-Tap thủ công (chỉ prompt, không gọi BE)');
    try {
      const token = await promptGoogleSignIn();
      // Chỉ hiện 20 ký tự đầu/ cuối — token JWT không in toàn bộ lên UI.
      const preview = token.length > 40 ? `${token.slice(0, 20)}...${token.slice(-20)}` : token;
      addGoogleDebugEvent('success', `One-Tap OK — ID token nhận được (preview): ${preview}`);
    } catch (e) {
      addGoogleDebugEvent(
        'error',
        `One-Tap FAIL: ${getApiErrorMessage(e)} (code: ${(e as { code?: string }).code ?? '-'})`,
      );
    } finally {
      setTesting(false);
    }
  };

  return (
    <Modal transparent animationType="fade" onRequestClose={() => undefined}>
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={() => undefined}
        accessibilityLabel="Chiếm màn hình để không cho chạm vào UI phía sau (bấm Xóa để đóng)"
      >
        <View style={styles.card}>
          <View style={styles.header}>
            <Text style={styles.title}>🔧 Debug Google Sign-In (tạm thời)</Text>
            <Pressable onPress={clearGoogleDebugEvents}>
              <Text style={styles.clear}>Xóa &amp; Đóng</Text>
            </Pressable>
          </View>

          <View style={styles.actions}>
            <Pressable style={styles.actionBtn} onPress={testOneTap} disabled={testing}>
              <Text style={styles.actionText}>{testing ? 'Đang chạy…' : 'Test One-Tap'}</Text>
            </Pressable>
          </View>

          <ScrollView style={styles.log} contentContainerStyle={styles.logContent}>
            {events.map((ev) => (
              <View key={ev.id} style={styles.logRow}>
                <Text style={[styles.logTime, { color: LEVEL_COLOR[ev.level] }]}>
                  [{ev.time}] {ev.level.toUpperCase()}
                </Text>
                <Text style={styles.logMsg} numberOfLines={4}>
                  {ev.message}
                </Text>
              </View>
            ))}
          </ScrollView>
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    backgroundColor: 'rgba(17, 24, 39, 0.96)',
    padding: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  title: { color: '#FCD34D', fontSize: 14, fontWeight: '800' },
  clear: { color: '#F87171', fontSize: 12, fontWeight: '700' },
  actions: { marginBottom: 8 },
  actionBtn: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#1D4ED8',
  },
  actionText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  log: { flex: 1 },
  logContent: { gap: 6 },
  logRow: { gap: 2 },
  logTime: { fontSize: 10, fontWeight: '700' },
  logMsg: { color: '#E5E7EB', fontSize: 12, lineHeight: 17 },
});
