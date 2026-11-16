// components/common/InfiniteListFooter.tsx
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

type Props = {
  loadingMore: boolean;
  moreError: string | null;
  hasMore: boolean;
  hasItems: boolean;
  onRetry: () => void;
};

/** Chân danh sách cuộn vô hạn: vòng xoay / lỗi + thử lại / đã hết dữ liệu / dòng thương hiệu */
export default function InfiniteListFooter({
  loadingMore,
  moreError,
  hasMore,
  hasItems,
  onRetry,
}: Props) {
  return (
    <View style={styles.wrap}>
      {loadingMore && <ActivityIndicator color="#F97316" style={styles.spinner} />}

      {moreError && !loadingMore && (
        <View style={styles.errorRow}>
          <Text style={styles.errorText}>Không tải thêm được.</Text>
          <Pressable onPress={onRetry} hitSlop={8}>
            <Text style={styles.retry}>Thử lại</Text>
          </Pressable>
        </View>
      )}

      {!hasMore && hasItems && !loadingMore && !moreError && (
        <Text style={styles.end}>Bạn đã xem hết danh sách</Text>
      )}

      <Text style={styles.brand}>clubhub. – Một phần của hành trình FPTU Xperience</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', paddingTop: 20 },
  spinner: { paddingVertical: 8 },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  errorText: { fontSize: 12.5, color: '#6B7280' },
  retry: { fontSize: 12.5, fontWeight: '800', color: '#F97316' },
  end: { fontSize: 12, color: '#9CA3AF', paddingVertical: 8 },
  brand: { fontSize: 11, color: '#9CA3AF', marginTop: 12 },
});