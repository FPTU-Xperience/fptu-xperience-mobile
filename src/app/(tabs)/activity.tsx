// app/(tabs)/activity.tsx
import { useRouter, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import {
  cancelRegistration,
  fetchActivities,
  registerForActivity,
} from '@/services/activities';
import { fetchSchedule } from '@/services/schedule';
import type { ActivityEvent, ActivityFeed, FilterKey } from '@/types/activity';
import type { ScheduleEvent } from '@/types/schedule';

const PAGE_SIZE = 6;

export default function ActivityScreen() {
  const router = useRouter();
  const [keyword, setKeyword] = useState('');
  const [filter, setFilter] = useState<FilterKey>('all');
  const [registrationLoadingId, setRegistrationLoadingId] = useState<string | null>(null);
  const [registrationOverrides, setRegistrationOverrides] = useState<Record<string, Partial<Pick<ActivityEvent, 'isRegistered' | 'registrationVersion' | 'canCancelRegistration'>>>>({});

  // Debounce từ khoá 250ms.
  const [debouncedKeyword, setDebouncedKeyword] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedKeyword(keyword), 250);
    return () => clearTimeout(timer);
  }, [keyword]);

  const [scheduleMap, setScheduleMap] = useState<Record<string, Pick<ScheduleEvent, 'isRegistered' | 'registrationVersion' | 'canCancelRegistration'>>>({});

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

  const loadRegistrationStatus = useCallback(async () => {
    try {
      const schedule = await fetchSchedule({ limit: 100 });
      const next: Record<string, Pick<ScheduleEvent, 'isRegistered' | 'registrationVersion' | 'canCancelRegistration'>> = {};
      // Gộp cả 3 nguồn (sắp tới / đang diễn ra / đã tham gia) để hoạt động
      // user đã tham gia + chờ check-in vẫn được đánh dấu "Đã đăng ký".
      for (const event of [
        ...schedule.upcomingThisWeek,
        ...schedule.live,
        ...schedule.attended,
      ]) {
        next[event.id] = {
          isRegistered: event.isRegistered,
          registrationVersion: event.registrationVersion,
          canCancelRegistration: event.canCancelRegistration,
        };
      }
      setScheduleMap(next);
    } catch {
      // Activity feed vẫn hiển thị được nếu schedule endpoint lỗi.
    }
  }, []);

  useEffect(() => {
    const task = Promise.resolve().then(loadRegistrationStatus);
    return () => {
      void task;
    };
  }, [loadRegistrationStatus]);

  // Tab Activity được giữ nguyên khi user chuyển tab → trạng thái đăng ký có
  // thể bị cũ (vd đăng ký ở màn chi tiết rồi quay về). Khi tab nhận lại focus,
  // đồng bộ lại trạng thái từ schedule API + làm mới danh sách. Bỏ qua lần focus
  // đầu (effect ở trên đã fetch khi mount) — dùng ref đếm lần focus.
  const focusCount = useRef(0);
  useFocusEffect(
    useCallback(() => {
      focusCount.current += 1;
      if (focusCount.current > 1) {
        loadRegistrationStatus();
        refresh();
      }
    }, [loadRegistrationStatus, refresh]),
  );

  const displayedEvents = useMemo(
    () => events.map((event) => ({
      ...event,
      ...(scheduleMap[event.id] ?? {}),
      ...(registrationOverrides[event.id] ?? {}),
    })),
    [events, registrationOverrides, scheduleMap],
  );

  const openDetail = (event: ActivityEvent) => {
    router.push({ pathname: '/event/[id]', params: { id: event.id } });
  };

  const handleRegistration = (event: ActivityEvent) => {
    if (registrationLoadingId) return;
    if (event.isRegistered) {
      if (!event.canCancelRegistration || !event.registrationVersion) return;
      Alert.alert('Xác nhận hủy đăng ký', `Bạn muốn hủy đăng ký ${event.title}?`, [
        { text: 'Giữ đăng ký', style: 'cancel' },
        { text: 'Hủy đăng ký', style: 'destructive', onPress: () => void cancel(event) },
      ]);
      return;
    }
    void register(event);
  };

  const register = async (event: ActivityEvent) => {
    setRegistrationLoadingId(event.id);
    try {
      const result = await registerForActivity(event.id);
      if (result.success) await loadRegistrationStatus();
      Alert.alert(result.success ? 'Đăng ký thành công' : 'Đăng ký thất bại', result.message);
    } catch (err) {
      Alert.alert('Đăng ký thất bại', getApiErrorMessage(err));
    } finally {
      setRegistrationLoadingId(null);
    }
  };

  const cancel = async (event: ActivityEvent) => {
    if (!event.registrationVersion) return;
    setRegistrationLoadingId(event.id);
    try {
      const result = await cancelRegistration(event.id, event.registrationVersion);
      if (result.success) {
        setRegistrationOverrides((current) => ({
          ...current,
          [event.id]: { isRegistered: false, registrationVersion: null, canCancelRegistration: false },
        }));
        await loadRegistrationStatus();
      }
      Alert.alert(result.success ? 'Đã hủy đăng ký' : 'Hủy đăng ký thất bại', result.message);
    } catch (err) {
      Alert.alert('Hủy đăng ký thất bại', getApiErrorMessage(err));
    } finally {
      setRegistrationLoadingId(null);
    }
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
        data={displayedEvents}
        extraData={`${loading}-${registrationLoadingId}-${scheduleMap}`}
        keyExtractor={(e) => e.id}
        renderItem={({ item }) => (
          <View style={[styles.item, loading && styles.dim]}>
            <EventCard
              event={item}
              onPressDetail={openDetail}
              onRegistration={handleRegistration}
              registrationLoading={registrationLoadingId === item.id}
            />
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
            hasItems={displayedEvents.length > 0}
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
