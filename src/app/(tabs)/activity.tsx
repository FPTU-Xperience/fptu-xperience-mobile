// app/(tabs)/activity.tsx
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import EventCard from '@/components/activity/EventCard';
import ErrorState from '@/components/common/ErrorState';
import FilterChips from '@/components/common/FilterChips';
import InfiniteListFooter from '@/components/common/InfiniteListFooter';
import ListScreenLayout from '@/components/common/ListScreenLayout';
import ScreenHeader from '@/components/common/ScreenHeader';
import SearchBar from '@/components/common/SearchBar';
import { useInfiniteList } from '@/hooks/useInfiniteList';
import { getApiErrorMessage } from '@/services/apiClient';
import { fetchActivities } from '@/services/activities';
import type { ActivityEvent, ActivityFeed, FilterKey } from '@/types/activity';

const PAGE_SIZE = 6;

export default function ActivityScreen() {
  const router = useRouter();
  const [keyword, setKeyword] = useState('');
  const [filter, setFilter] = useState<FilterKey>('all');

  // Debounce từ khoá 250ms.
  const [debouncedKeyword, setDebouncedKeyword] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedKeyword(keyword), 250);
    return () => clearTimeout(timer);
  }, [keyword]);

  const {
    items: events,
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
  } = useInfiniteList<ActivityEvent, ActivityFeed>(
    async (cursor) => {
      const res = await fetchActivities({
        keyword: debouncedKeyword,
        filter,
        cursor,
        limit: PAGE_SIZE,
      });
      return {
        items: res.events,
        nextCursor: res.nextCursor ?? null,
        meta: res,
      };
    },
    [debouncedKeyword, filter],
    { keyOf: (e) => e.id, getErrorMessage: getApiErrorMessage },
  );

  const openDetail = (event: ActivityEvent) => {
    router.push({ pathname: '/event/[id]', params: { id: event.id } });
  };

  // Truyền dạng element (không phải component) để ô tìm kiếm không bị mất focus khi gõ
  const header = (
    <View>
      <ScreenHeader campus={meta?.campus} title="Tất cả hoạt động sắp tới" />
      <SearchBar
        value={keyword}
        onChangeText={setKeyword}
        placeholder="Tìm hoạt động..."
      />
      {meta && <FilterChips filters={meta.filters} selected={filter} onSelect={setFilter} />}

      <View style={styles.summary}>
        <View style={styles.summaryLeft}>
          <View style={styles.dot} />
          <Text style={styles.summaryText}>
            {meta ? `${meta.total ?? 0} hoạt động để khám phá` : ' '}
          </Text>
        </View>
      </View>
    </View>
  );

  const empty = error ? (
    <ErrorState message={error} onRetry={retry} loading={loading} />
  ) : loading ? (
    <ActivityIndicator color="#F97316" style={styles.loader} />
  ) : (
    <Text style={styles.empty}>Không tìm thấy hoạt động phù hợp</Text>
  );

  return (
    <ListScreenLayout title="Hoạt động">
      <FlatList
        data={events}
        extraData={loading}
        keyExtractor={(e) => e.id}
        renderItem={({ item }) => (
          <View style={[styles.item, loading && styles.dim]}>
            <EventCard event={item} onPressDetail={openDetail} />
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
            hasItems={events.length > 0}
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
  summaryText: { fontSize: 12, color: '#6B7280' },
  item: { paddingHorizontal: 22 },
  separator: { height: 22 },
  dim: { opacity: 0.5 },
  loader: { marginTop: 40 },
  empty: { textAlign: 'center', color: '#9CA3AF', marginTop: 40 },
});
