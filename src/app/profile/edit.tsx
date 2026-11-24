// app/profile/edit.tsx
//
// Màn chỉnh sửa hồ sơ (Phase 4) — route protected ở root Stack.
//
// Đặt ngoài `(tabs)` để tránh xung đột Expo Router giữa file
// `(tabs)/profile.tsx` và thư mục `(tabs)/profile/`. Root route vẫn thừa hưởng
// auth guard từ `<Stack.Protected guard={isAuthenticated}>`.
//
// Flow: fetch GET /api/users/me/profile (source của form + version + editableFields)
//   → ProfileEditForm (3 tab) → "Lưu" → patchSelfProfile → thành công: retry feed
//     của màn profile + quay về; lỗi: giữ draft, hiện error trong form.

import { useRouter } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import ErrorState from '@/components/common/ErrorState';
import ProfileEditForm from '@/components/profile/ProfileEditForm';
import { useApiState } from '@/hooks/useApiState';
import { useAuth } from '@/providers/AuthProvider';
import { fetchSelfProfile } from '@/services/profile';

export default function ProfileEditScreen() {
  const router = useRouter();
  const { user } = useAuth();

  const goBack = () => router.replace('/(tabs)/profile');

  // fetchSelfProfile "nín" lỗi (trả null) — route cần có trạng thái lỗi thật
  // để hiện ErrorState + retry, không thì spinner vô hạn khi BE lỗi.
  const {
    data: profile,
    loading,
    error,
    hasError,
    retry,
  } = useApiState(async () => {
    const p = await fetchSelfProfile();
    if (!p) throw new Error('Không tải được hồ sơ chuẩn.');
    return p;
  }, []);

  const handleSaved = () => {
    // Feed của màn profile đã dùng useApiState(retry) → khi quay về sẽ nạp lại.
    // Đây chỉ là để reset local state của màn này + thông báo.
    Alert.alert('Đã lưu', 'Hồ sơ của bạn đã được cập nhật.', [
      { text: 'Quay lại', onPress: goBack },
    ]);
  };

  return (
    <View style={styles.root}>
      <SafeAreaView edges={['top']} style={styles.safe}>
        <View style={styles.topbar}>
          <Pressable style={styles.back} onPress={goBack} hitSlop={8}>
            <ChevronLeft size={20} color="#374151" />
            <Text style={styles.backText}>Quay lại</Text>
          </Pressable>

          <Text style={styles.title}>CHỈNH SỬA HỒ SƠ</Text>

          <View style={styles.side} />
        </View>
      </SafeAreaView>

      {hasError && error ? (
        <ErrorState message={error} onRetry={retry} loading={loading} />
      ) : loading || !profile ? (
        <ActivityIndicator color="#F97316" style={styles.loader} />
      ) : (
        <ProfileEditForm
          key={profile.version}
          profile={profile}
          campus={user?.campus}
          onSaved={handleSaved}
          onClose={goBack}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F9FAFB' },
  safe: { backgroundColor: '#fff' },
  topbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  back: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 2 },
  backText: { fontSize: 13, fontWeight: '600', color: '#374151' },
  title: { fontSize: 12, fontWeight: '800', color: '#6B7280', letterSpacing: 1 },
  side: { flex: 1, alignItems: 'flex-end' },
  loader: { marginTop: 40 },
});
