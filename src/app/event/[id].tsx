// app/event/[id].tsx
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Briefcase, Users } from 'lucide-react-native';
  import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, Share, StyleSheet, Text, View } from 'react-native';

import AssignmentTab from '@/components/event-detail/AssignmentTab';
import BottomActionBar from '@/components/event-detail/BottomActionBar';
import DetailHero from '@/components/event-detail/DetailHero';
import DetailSummary from '@/components/event-detail/DetailSummary';
import DetailTabs from '@/components/event-detail/DetailTabs';
import DetailTopBar from '@/components/event-detail/DetailTopBar';
import EmptyBlock from '@/components/event-detail/EmptyBlock';
import OverviewTab from '@/components/event-detail/OverviewTab';
import { DocumentsTab, MediaTab } from '@/components/event-detail/ResourceTabs';
import ErrorState from '@/components/common/ErrorState';
import { useApiState } from '@/hooks/useApiState';
import { getApiErrorMessage } from '@/services/apiClient';
import {
  fetchActivityDetail,
  fetchActivityResources,
  fetchMyAttendance,
  registerForActivity,
  cancelRegistration,
} from '@/services/activities';
import type {
  ActivityDetail,
  DetailTabKey,
  RegisterState,
} from '@/types/activityDetail';

const TABS: { key: DetailTabKey; label: string }[] = [
  { key: 'overview', label: 'Tổng quan' },
  { key: 'documents', label: 'Tài liệu' },
  { key: 'media', label: 'Media' },
  { key: 'assignments', label: 'Phân công' },
  { key: 'recruitment', label: 'Tuyển dụng' },
];

export default function EventDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const activityId = String(id ?? '');

  const [tab, setTab] = useState<DetailTabKey>('overview');
  const [registeredOverride, setRegisteredOverride] = useState<boolean | null>(null);
  const [registering, setRegistering] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  // Tổng quan + tài nguyên + điểm danh: 3 request song song, lỗi cục bộ
  // (vd resources bị 403) không làm hỏng cả trang.
  const { data, loading, error, hasError, retry } = useApiState(
    async () => {
      const base = await fetchActivityDetail(activityId);
      if (!base) return null;

      const [resources, attendance] = await Promise.all([
        fetchActivityResources(activityId).catch(() => ({ documents: [], media: [] })),
        fetchMyAttendance(activityId).catch(() => base.attendance),
      ]);

      return { ...base, documents: resources.documents, media: resources.media, attendance };
    },
    [activityId],
  );

  const detail: ActivityDetail | null = data;
  // null = chưa có thao tác cục bộ; dùng trạng thái authoritative từ detail API.
  // Sau register/cancel, override ngay để UI phản hồi tức thì.
  const registered = registeredOverride ?? detail?.isRegistered ?? false;

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/activity');
  };

  const handleShare = () => {
    if (!detail) return;
    Share.share({ message: `${detail.title} – ${detail.timeSummary} tại ${detail.location}` });
  };

  const handleRegister = async () => {
    if (!detail || registering || cancelling || registered) return;
    setRegistering(true);
    try {
      const result = await registerForActivity(detail.id);
      if (result.success) {
        setRegisteredOverride(true);
        retry();
      }
      Alert.alert(result.success ? 'Đăng ký thành công' : 'Đăng ký thất bại', result.message);
    } catch (err) {
      Alert.alert('Đăng ký thất bại', getApiErrorMessage(err));
    } finally {
      setRegistering(false);
    }
  };

  const handleCancel = async () => {
    if (!detail || cancelling || registering || !detail.registrationVersion) return;
    setCancelling(true);
    try {
      const result = await cancelRegistration(detail.id, detail.registrationVersion);
      if (result.success) setRegisteredOverride(false);
      Alert.alert(result.success ? 'Đã hủy đăng ký' : 'Hủy đăng ký thất bại', result.message);
      if (result.success) retry();
    } catch (err) {
      Alert.alert('Hủy đăng ký thất bại', getApiErrorMessage(err));
    } finally {
      setCancelling(false);
    }
  };

  const requestCancelConfirmation = () => {
    if (!detail || !registered || !detail.canCancelRegistration || cancelling || registering) return;
    Alert.alert(
      'Xác nhận hủy đăng ký',
      `Bạn muốn hủy đăng ký tham gia ${detail.title}? Chỉ hủy được trước giờ bắt đầu và khi chưa có dữ liệu điểm danh.`,
      [
        { text: 'Giữ đăng ký', style: 'cancel' },
        { text: 'Xác nhận hủy đăng ký', style: 'destructive', onPress: () => void handleCancel() },
      ],
    );
  };

  const reload = useCallback(() => retry(), [retry]);
  const canCancel =
    registered &&
    detail?.canCancelRegistration === true &&
    typeof detail.registrationVersion === 'string' &&
    /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(detail.registrationVersion);

  const registerState: RegisterState = {
    registered,
    loading: registering,
    disabled: detail?.status === 'ended',
    cancelling,
    canCancel,
  };

  return (
    <View style={styles.root}>
      <DetailTopBar
        onBack={goBack}
        onShare={handleShare}
      />

      {hasError && error ? (
        <View style={styles.center}>
          <ErrorState message={error} onRetry={retry} loading={loading} />
        </View>
      ) : loading && !detail ? (
        <ActivityIndicator color="#F97316" style={styles.center} />
      ) : !detail ? (
        <View style={styles.center}>
          <Text style={styles.notFound}>Không tìm thấy hoạt động</Text>
        </View>
      ) : (
        <>
          <ScrollView
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}>
            <DetailHero title={detail.title} hubLabel={detail.hubLabel} color={detail.bannerColor} />
            <DetailSummary detail={detail} register={registerState} onRegister={handleRegister} />

            <DetailTabs tabs={TABS} selected={tab} onSelect={setTab} />

            {tab === 'overview' && <OverviewTab detail={detail} />}
            {tab === 'documents' && <DocumentsTab items={detail.documents} />}
            {tab === 'media' && <MediaTab items={detail.media} />}

            {/* Phân công: chưa có nguồn API cho student → hiện trạng thái
                "đang cập nhật" thay vì bịa dữ liệu. Phần ĐIỂM DANH bên dưới
                vẫn dùng dữ liệu thật từ /my-attendance. */}
            {tab === 'assignments' && (
              <>
                <EmptyBlock
                  icon={Briefcase}
                  title="Phân công đang cập nhật"
                  description="Danh sách phân công nhiệm vụ sẽ hiển thị tại đây khi CLB công bố."
                />
                <AssignmentTab detail={detail} onReloadSession={reload} />
              </>
            )}

            {/* Tuyển dụng: chưa có nguồn API cho student. */}
            {tab === 'recruitment' && (
              <EmptyBlock
                icon={Users}
                title="Tuyển dụng đang cập nhật"
                description="Thông tin tuyển dụng nhân sự sẽ hiển thị tại đây khi CLB công bố."
              />
            )}
          </ScrollView>

          <BottomActionBar register={registerState} onRegister={handleRegister} onCancel={requestCancelConfirmation} />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F4F5FA' },
  content: { paddingBottom: 32 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  notFound: { fontSize: 14, color: '#6B7280' },
});