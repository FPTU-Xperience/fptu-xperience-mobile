// app/(tabs)/explore.tsx
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import type { ScrollViewInstance } from 'react-native';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import ErrorState from '@/components/common/ErrorState';
import FilterChips from '@/components/common/FilterChips';
import ScreenLayout from '@/components/common/ScreenLayout';
import SearchBar from '@/components/common/SearchBar';
import DiscoverSectionTitle from '@/components/discover/DiscoverSectionTitle';
import HeroCard from '@/components/discover/HeroCard';
import Pagination from '@/components/discover/Pagination';
import RecoClubCard from '@/components/discover/RecoClubCard';
import RecoEventCard from '@/components/discover/RecoEventCard';
import { useApiState } from '@/hooks/useApiState';
import { fetchRecoBase, fetchRecoClubsSection } from '@/services/recommendation';
import type { RecoClubCategoryKey, RecoEventFilterKey } from '@/types/recommendation';

export default function ExploreScreen() {
  const router = useRouter();

  const [eventStatus, setEventStatus] = useState<RecoEventFilterKey>('all');
  const [keyword, setKeyword] = useState('');
  const [category, setCategory] = useState<RecoClubCategoryKey>('all');
  const [page, setPage] = useState(1);

  // Ref của ScrollView (nội dung tab) để cuộn về đầu phần CLB khi đổi trang.
  const scrollRef = useRef<ScrollViewInstance | null>(null);
  // Vị trí (y) của đầu section "Câu lạc bộ dành cho bạn", đo khi layout.
  const clubsTopRef = useRef(0);
  const onClubsLayout = (e: { nativeEvent: { layout: { y: number } } }) => {
    clubsTopRef.current = e.nativeEvent.layout.y;
  };
  // Đặt cờ khi người dùng đổi trang; cuộn thật sự CHỜ đến khi data trang mới
  // đã về + layout xong (đúng vị trí section), tránh cuộn trước khi render.
  const scrollToClubsRef = useRef(false);

  // Debounce từ khoá 250ms để không gọi API mỗi lần gõ.
  const [debouncedKeyword, setDebouncedKeyword] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedKeyword(keyword), 250);
    return () => clearTimeout(timer);
  }, [keyword]);

  // 2 nguồn dữ liệu ĐỘC LẬP:
  // - base: hero + events (chỉ đổi theo eventStatus/keyword)
  // - clubs: section CLB (đổi theo keyword/category/page)
  // → bấm phân trang chỉ refetch section CLB, phần events trên màn giữ nguyên.
  const base = useApiState(
    () => fetchRecoBase({ eventStatus, keyword: debouncedKeyword }),
    [eventStatus, debouncedKeyword],
  );

  const clubs = useApiState(
    () => fetchRecoClubsSection({ keyword: debouncedKeyword, category, page }),
    [debouncedKeyword, category, page],
  );

  const changeKeyword = (text: string) => {
    setKeyword(text);
    setPage(1);
  };

  const changeCategory = (key: RecoClubCategoryKey) => {
    setCategory(key);
    setPage(1);
  };

  const changePage = (next: number) => {
    if (
      clubs.data &&
      next >= 1 &&
      next <= clubs.data.pagination.pageCount
    ) {
      // Đánh dấu để cuộn về đầu section CLB SAU khi data trang mới đã về.
      scrollToClubsRef.current = true;
      setPage(next);
    }
  };

  // Cuộn thật sự khi data trang CLB mới đã render xong. setTimeout ngắn để
  // onLayout kịp cập nhật clubsTopRef trước khi cuộn.
  useEffect(() => {
    if (!clubs.data || !scrollToClubsRef.current) return;
    const wasRequested = scrollToClubsRef.current;
    scrollToClubsRef.current = false;
    if (!wasRequested) return;
    const id = setTimeout(() => {
      scrollRef.current?.scrollTo({ y: clubsTopRef.current, animated: true });
    }, 50);
    return () => clearTimeout(id);
  }, [clubs.data]);

  // Cả màn hình chỉ render được khi đã có dữ liệu nền (hero + events).
  if (base.hasError && base.error) {
    return (
      <ScreenLayout title="Khám phá" scrollRef={scrollRef}>
        <ErrorState message={base.error} onRetry={base.retry} loading={base.loading} />
      </ScreenLayout>
    );
  }

  if (!base.data) {
    return (
      <ScreenLayout title="Khám phá" scrollRef={scrollRef}>
        <ActivityIndicator color="#F97316" style={styles.loader} />
      </ScreenLayout>
    );
  }

  const events = base.data.events;

  // Section CLB tự quản lý trạng thái (loading/error) của riêng nó.
  const renderClubsSection = () => {
    if (clubs.hasError && clubs.error) {
      return (
        <View style={styles.clubSection}>
          <ErrorState message={clubs.error} onRetry={clubs.retry} loading={clubs.loading} />
        </View>
      );
    }
    if (!clubs.data) {
      return (
        <View style={styles.clubSection}>
          <ActivityIndicator color="#F97316" style={styles.sectionLoader} />
        </View>
      );
    }
    return (
      <>
        <SearchBar
          value={keyword}
          onChangeText={changeKeyword}
          placeholder="Tìm câu lạc bộ theo tên, lĩnh vực..."
        />
        <FilterChips
          filters={clubs.data.filters}
          selected={category}
          onSelect={changeCategory}
        />
        <View style={[styles.list, styles.clubList, clubs.loading && styles.dim]}>
          {clubs.data.items.map((c) => (
            <RecoClubCard
              key={c.id}
              club={c}
              onPress={(club) =>
                router.push({ pathname: '/club/[id]', params: { id: club.id } })
              }
            />
          ))}
          {clubs.data.items.length === 0 && (
            <Text style={styles.empty}>Không tìm thấy câu lạc bộ phù hợp</Text>
          )}
        </View>

        <Pagination
          page={clubs.data.pagination.page}
          pageCount={clubs.data.pagination.pageCount}
          onChange={changePage}
        />
      </>
    );
  };

  return (
    <ScreenLayout title="Khám phá" scrollRef={scrollRef}>
      <View>
        {/* Hero */}
        <HeroCard
          hero={base.data.hero}
          onPressPrimary={() => router.navigate('/allClubs')}
          onPressSecondary={() => router.navigate('/activity')}
        />

        {/* Hoạt động dành cho bạn */}
        <DiscoverSectionTitle
          title="Hoạt động dành cho bạn"
          subtitle="Khám phá hoạt động đang & sắp diễn ra"
          linkLabel="Tất cả"
          onPressLink={() => router.navigate('/activity')}
        />
        <FilterChips
          filters={events.filters}
          selected={eventStatus}
          onSelect={setEventStatus}
        />
        <View style={[styles.list, base.loading && styles.dim]}>
          {events.items.map((e) => (
            <RecoEventCard
              key={e.id}
              event={e}
              onPress={(ev) => router.push({ pathname: '/event/[id]', params: { id: ev.id } })}
            />
          ))}
          {events.items.length === 0 && (
            <Text style={styles.empty}>Chưa có hoạt động phù hợp</Text>
          )}
        </View>

        {/* Câu lạc bộ dành cho bạn */}
        <View onLayout={onClubsLayout} style={styles.clubAnchor}>
          <DiscoverSectionTitle
            title="Câu lạc bộ dành cho bạn"
            subtitle="Khám phá những cộng đồng được tuyển chọn để bắt đầu hành trình."
            meta={
              clubs.data
                ? `${clubs.data.pagination.total} CLB gợi ý`
                : undefined
            }
          />
        </View>
        {renderClubsSection()}
      </View>
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  loader: { marginTop: 60 },
  sectionLoader: { marginTop: 40 },
  dim: { opacity: 0.6 },
  list: { paddingHorizontal: 22, gap: 22, marginTop: 14 },
  clubList: { gap: 18 },
  // Wrapper chỉ để đo vị trí đầu section CLB khi đổi trang (không có style riêng).
  clubAnchor: {},
  clubSection: { marginTop: 4 },
  empty: { textAlign: 'center', color: '#9CA3AF', marginTop: 20 },
});
