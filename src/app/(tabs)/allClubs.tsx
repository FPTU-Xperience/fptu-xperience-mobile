// app/(tabs)/allClubs.tsx
import { useRouter } from 'expo-router';
import { UserPlus } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import ClubCard from '@/components/explore/ClubCard';
import ErrorState from '@/components/common/ErrorState';
import FilterChips from '@/components/common/FilterChips';
import InfiniteListFooter from '@/components/common/InfiniteListFooter';
import ListScreenLayout from '@/components/common/ListScreenLayout';
import ScreenHeader from '@/components/common/ScreenHeader';
import SearchBar from '@/components/common/SearchBar';
import { useInfiniteList } from '@/hooks/useInfiniteList';
// Nếu getApiErrorMessage nằm ở file khác, sửa lại đường dẫn import này.
import { getApiErrorMessage } from '@/services/apiClient';
import { fetchClubs } from '@/services/clubs';
import type { Club, ClubFilter, ClubFilterKey } from '@/types/club';

const PAGE_SIZE = 4;

type ClubsMeta = {
  campus: string;
  filters: ClubFilter[];
  total: number;
};

export default function AllClubsScreen() {
  const router = useRouter();
  const [keyword, setKeyword] = useState('');
  const [filter, setFilter] = useState<ClubFilterKey>('all');
  const [recruitingOnly, setRecruitingOnly] = useState(false);

  // Debounce từ khoá 250ms.
  const [debouncedKeyword, setDebouncedKeyword] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedKeyword(keyword), 250);
    return () => clearTimeout(timer);
  }, [keyword]);

  const {
    items: clubs,
    meta,
    hasMore,
    loading,
    refreshing,
    loadingMore,
    error,
    moreError,
    loadMore,
    refresh,
    retry,
    retryMore,
  } = useInfiniteList<Club, ClubsMeta>(
    async (cursor) => {
      const res = await fetchClubs({
        keyword: debouncedKeyword,
        filter,
        recruitingOnly,
        cursor,
        limit: PAGE_SIZE,
      });
      return {
        items: res.clubs,
        nextCursor: res.nextCursor ?? null,
        meta: { campus: res.campus, filters: res.filters, total: res.total },
      };
    },
    [debouncedKeyword, filter, recruitingOnly],
    { keyOf: (c) => c.id, getErrorMessage: getApiErrorMessage },
  );

  const openDetail = (club: Club) => {
    router.push({ pathname: '/club/[id]', params: { id: club.id } });
  };

  // Truyền dạng element (không phải component) để ô tìm kiếm không bị mất focus khi gõ
  const header = (
    <View>
      <ScreenHeader campus={meta?.campus} title="Tất cả câu lạc bộ" />
      <SearchBar
        value={keyword}
        onChangeText={setKeyword}
        placeholder="Tìm kiếm câu lạc bộ theo tên, lĩnh vực..."
      />
      {meta && <FilterChips filters={meta.filters} selected={filter} onSelect={setFilter} />}

      <View style={styles.summary}>
        <View style={styles.summaryLeft}>
          <View style={styles.dot} />
          <Text style={styles.summaryText}>
            {meta ? `${meta.total} câu lạc bộ phù hợp` : ' '}
          </Text>
        </View>
        <Pressable
          onPress={() => setRecruitingOnly((v) => !v)}
          style={[styles.toggle, recruitingOnly && styles.toggleActive]}>
          <UserPlus size={13} color={recruitingOnly ? '#C2410C' : '#6B7280'} />
          <Text style={[styles.toggleText, recruitingOnly && styles.toggleTextActive]}>
            Đang tuyển
          </Text>
        </Pressable>
      </View>
    </View>
  );

  const empty = error ? (
    <ErrorState message={error} onRetry={retry} loading={loading} />
  ) : loading ? (
    <ActivityIndicator color="#F97316" style={styles.loader} />
  ) : (
    <Text style={styles.empty}>Không tìm thấy câu lạc bộ phù hợp</Text>
  );

  return (
    <ListScreenLayout title="Câu lạc bộ">
      <FlatList
        data={clubs}
        extraData={loading}
        keyExtractor={(c) => c.id}
        renderItem={({ item }) => (
          <View style={[styles.item, loading && styles.dim]}>
            <ClubCard club={item} onPressDetail={openDetail} />
          </View>
        )}
        ItemSeparatorComponent={Separator}
        ListHeaderComponent={header}
        ListEmptyComponent={empty}
        ListFooterComponent={
          <InfiniteListFooter
            loadingMore={loadingMore}
            moreError={moreError}
            hasMore={hasMore}
            hasItems={clubs.length > 0}
            onRetry={retryMore}
          />
        }
        onEndReached={loadMore}
        onEndReachedThreshold={0.5}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refresh}
            tintColor="#F97316"
            colors={['#F97316']}
          />
        }
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        initialNumToRender={4}
        maxToRenderPerBatch={4}
        windowSize={7}
        contentContainerStyle={styles.content}
      />
    </ListScreenLayout>
  );
}

const Separator = () => <View style={styles.separator} />;

const styles = StyleSheet.create({
  // chừa chỗ cho custom tab bar + nút nổi ở giữa
  content: { paddingBottom: 140 },
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    marginTop: 16,
    marginBottom: 12,
  },
  summaryLeft: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#F97316' },
  summaryText: { fontSize: 12, color: '#6B7280', fontWeight: '500' },
  toggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  toggleActive: { backgroundColor: '#FFE9D6', borderColor: '#FDBA74' },
  toggleText: { fontSize: 11, fontWeight: '600', color: '#6B7280' },
  toggleTextActive: { color: '#C2410C' },
  item: { paddingHorizontal: 22 },
  separator: { height: 22 },
  dim: { opacity: 0.5 },
  loader: { marginTop: 40 },
  empty: { textAlign: 'center', color: '#9CA3AF', marginTop: 40 },
});