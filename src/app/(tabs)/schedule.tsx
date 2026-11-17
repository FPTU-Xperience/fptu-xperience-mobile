// app/(tabs)/schedule.tsx
import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import ErrorState from '@/components/common/ErrorState';
import InfiniteListFooter from '@/components/common/InfiniteListFooter';
import ListScreenLayout from '@/components/common/ListScreenLayout';
import ScreenHeader from '@/components/common/ScreenHeader';
import SectionHeader from '@/components/common/SectionHeader';
import EmptySchedule from '@/components/schedule/EmptySchedule';
import ScheduleItem from '@/components/schedule/ScheduleItem';
import ScheduleTabs from '@/components/schedule/ScheduleTabs';
import { useInfiniteList } from '@/hooks/useInfiniteList';
import { getApiErrorMessage } from '@/services/apiClient';
import { fetchSchedule } from '@/services/schedule';
import type { ScheduleEvent, ScheduleFeed, ScheduleTabKey } from '@/types/schedule';

const PAGE_SIZE = 5;

export default function ScheduleScreen() {
  const router = useRouter();
  // null = user CHƯA bấm tab → dùng tab mặc định (tính dẫn xuất dưới).
  // Một khi user chọn, giữ theo lựa chọn của user (không bị đè khi reload).
  const [tab, setTab] = useState<ScheduleTabKey | null>(null);

  const {
    items: upcoming,
    meta: feed,
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
  } = useInfiniteList<ScheduleEvent, ScheduleFeed>(
    async (cursor) => {
      const res = await fetchSchedule({ cursor, limit: PAGE_SIZE });
      return { items: res.upcomingThisWeek, nextCursor: res.nextCursor ?? null, meta: res };
    },
    [],
    { keyOf: (e) => e.id, getErrorMessage: getApiErrorMessage },
  );

  // Tab mặc định: có hoạt động "đang diễn ra" → về tab "Đang diễn ra",
  // không thì "Sắp tới". Tính dẫn xuất trong render (không dùng effect).
  const defaultTab: ScheduleTabKey = feed?.live.length ? 'live' : 'upcoming';
  const activeTab = tab ?? defaultTab;

  const openDetail = (event: ScheduleEvent) => {
    router.push({ pathname: '/event/[id]', params: { id: event.id } });
  };

  const goToActivities = () => router.push('/activity');

  const upcomingCount = upcoming.length;
  const liveCount = feed?.live.length ?? 0;
  const attendedCount = feed?.attended.length ?? 0;

  const header = (
    <View>
      <ScreenHeader
        campus={feed?.campus}
        // eyebrow="KHÔNG GIAN CỦA BẠN"
        title="Lịch trình của tôi"
      />

      <ScheduleTabs
        tabs={[
          { key: 'upcoming', label: 'Sắp tới', count: upcomingCount },
          { key: 'live', label: 'Đang diễn ra', count: liveCount },
          { key: 'attended', label: 'Đã tham gia', count: attendedCount },
        ]}
        selected={activeTab}
        onSelect={setTab}
      />
    </View>
  );

  const upcomingList = (
    <FlatList
      data={upcoming}
      extraData={loading}
      keyExtractor={(e) => e.id}
      renderItem={({ item }) => (
        <View style={[styles.item, loading && styles.dim]}>
          <ScheduleItem event={item} onPressDetail={openDetail} />
        </View>
      )}
      ItemSeparatorComponent={Separator}
      ListHeaderComponent={
        upcoming.length > 0 ? (
          <SectionHeader title="HOẠT ĐỘNG SẮP TỚI" right={`${feed?.total ?? 0} sự kiện`} />
        ) : undefined
      }
      ListEmptyComponent={
        error ? (
          <ErrorState message={error} onRetry={retry} loading={loading} />
        ) : loading ? (
          <ActivityIndicator color="#F97316" style={styles.loader} />
        ) : (
          <EmptySchedule onPressExplore={goToActivities} />
        )
      }
      ListFooterComponent={
        <InfiniteListFooter
          loadingMore={loadingMore}
          moreError={moreError}
          hasMore={hasMore}
          hasItems={upcoming.length > 0}
          onRetry={retryMore}
        />
      }
      onEndReached={loadMore}
      onEndReachedThreshold={0.5}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor="#F97316" colors={['#F97316']} />
      }
      showsVerticalScrollIndicator={false}
      initialNumToRender={4}
      maxToRenderPerBatch={4}
      windowSize={7}
      contentContainerStyle={styles.content}
    />
  );

  const liveList = (
    <ScrollView contentContainerStyle={styles.content}>
      <SectionHeader title="ĐANG DIỄN RA" right={`${liveCount} sự kiện`} />
      {liveCount > 0 ? (
        <View style={styles.list}>
          {(feed?.live ?? []).map((e) => (
            <ScheduleItem key={e.id} event={e} onPressDetail={openDetail} />
          ))}
        </View>
      ) : (
        <Text style={styles.empty}>Hiện không có hoạt động nào đang diễn ra.</Text>
      )}
    </ScrollView>
  );

  const attendedList = (
    <ScrollView contentContainerStyle={styles.content}>
      <SectionHeader title="HOẠT ĐỘNG ĐÃ THAM GIA" right={`${attendedCount} sự kiện`} />
      {attendedCount > 0 ? (
        <View style={styles.list}>
          {(feed?.attended ?? []).map((e) => (
            <ScheduleItem key={e.id} event={e} />
          ))}
        </View>
      ) : (
        <Text style={styles.empty}>Bạn chưa tham gia hoạt động nào</Text>
      )}
    </ScrollView>
  );

  return (
    <ListScreenLayout title="Lịch Trình">
      {header}
      {activeTab === 'upcoming' ? upcomingList : activeTab === 'live' ? liveList : attendedList}
    </ListScreenLayout>
  );
}

const Separator = () => <View style={styles.separator} />;

const styles = StyleSheet.create({
  // chừa chỗ cho custom tab bar + nút nổi ở giữa
  content: { paddingBottom: 140 },
  list: { paddingHorizontal: 16, gap: 12 },
  item: { paddingHorizontal: 16 },
  separator: { height: 12 },
  dim: { opacity: 0.5 },
  loader: { marginTop: 40 },
  empty: { textAlign: 'center', color: '#9CA3AF', marginTop: 24 },
});
