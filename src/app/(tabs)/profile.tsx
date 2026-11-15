// app/(tabs)/profile.tsx
import { useFocusEffect, useRouter } from 'expo-router';
import { BookOpen, Heart } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import Card from '@/components/common/Card';
import CardTitle from '@/components/common/CardTitle';
import CampusLabel from '@/components/common/CampusLabel';
import ErrorState from '@/components/common/ErrorState';
import ScreenLayout from '@/components/common/ScreenLayout';
import SegmentedControl from '@/components/common/SegmentedControl';
import ClubsCard from '@/components/profile/ClubsCard';
import CompetencyCard from '@/components/profile/CompetencyCard';
import EvidenceTab from '@/components/profile/EvidenceTab';
import ProfileHero from '@/components/profile/ProfileHero';
import ProfileImageModal from '@/components/profile/ProfileImageModal';
import RewardsSheet from '@/components/profile/RewardsSheet';
import SkillsCard from '@/components/profile/SkillsCard';
import StatGrid from '@/components/profile/StatGrid';
import { useApiState } from '@/hooks/useApiState';
import { useAuth } from '@/providers/AuthProvider';
import { fetchProfile } from '@/services/profile';
import { fetchMyCosmetics } from '@/services/rewards';
import { getFrame } from '@/components/profile/avatarFrames';
import { frameUnlocked, loadFrame, saveFrame } from '@/services/frameState';
import type { ProfileImageKind } from '@/services/profile-media';
import type { ProfileTabKey } from '@/types/profile';
import type { CosmeticInventoryPage } from '@/types/api';

export default function ProfileScreen() {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const [tab, setTab] = useState<ProfileTabKey>('overview');
  const [imageModal, setImageModal] = useState<ProfileImageKind | null>(null);

  // --- Phase 6: khung avatar + kho quà ---
  const [inventory, setInventory] = useState<CosmeticInventoryPage | null>(null);
  const [storedFrame, setStoredFrame] = useState('none');
  const [rewardsOpen, setRewardsOpen] = useState(false);

  // Khung hiển thị: nếu khung đang lưu CHƯA mở (rewards mà chưa sở hữu →
  // inventory null/đã đổi) thì về 'none' — tính dẫn xuất thay vì effect setState.
  const equippedFrame = useMemo(
    () => (frameUnlocked(storedFrame, inventory) ? storedFrame : 'none'),
    [storedFrame, inventory],
  );

  const { data: feed, loading, error, hasError, retry } = useApiState(
    () => fetchProfile(user?.campus ?? ''),
    [],
  );

  // Kho cosmetics (sở hữu khung) — nạp khi có userId (login thật).
  // Lỗi → inventory null (chỉ khung free equip được) — không làm hỏng màn.
  useEffect(() => {
    let cancelled = false;
    if (!user) return;
    fetchMyCosmetics()
      .then((data) => {
        if (!cancelled) setInventory(data);
      })
      .catch(() => {
        if (!cancelled) setInventory(null);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  // Khung đang equip (lưu device-local) — nạp 1 lần theo userId.
  useEffect(() => {
    let cancelled = false;
    if (!user) return;
    loadFrame(user.id).then((state) => {
      if (!cancelled) setStoredFrame(state?.frame ?? 'none');
    });
    return () => {
      cancelled = true;
    };
  }, [user]);

  // Chọn khung: lưu + cập nhật state (equippedFrame tính dẫn xuất, re-render hero).
  const handleSelectFrame = useCallback(
    (frameId: string) => {
      if (!user) return;
      setStoredFrame(frameId);
      void saveFrame(user.id, frameId);
    },
    [user],
  );

  // Khi quay về tab profile (từ màn chỉnh sửa / my-clubs / modal ảnh) →
  // nạp lại feed để thấy dữ liệu mới. Bỏ qua lần focus đầu (useApiState
  // đã fetch khi mount) — dùng ref đếm lần focus.
  const focusCount = useRef(0);
  useFocusEffect(
    useCallback(() => {
      focusCount.current += 1;
      if (focusCount.current > 1) retry();
    }, [retry]),
  );

  const openRewards = useCallback(() => setRewardsOpen(true), []);

  // Kho quà đổi thành công → refresh inventory (mở khung mới).
  const handleInventoryChanged = useCallback(() => {
    fetchMyCosmetics()
      .then((data) => setInventory(data))
      .catch(() => undefined);
  }, []);

  return (
    <ScreenLayout title="Profile">
      <View style={styles.campus}>
        <CampusLabel campus={feed?.campus} />
      </View>

      {hasError && error ? (
        <ErrorState message={error} onRetry={retry} loading={loading} />
      ) : !feed ? (
        <ActivityIndicator color="#F97316" style={styles.loader} />
      ) : (
        <View style={[styles.content, loading && styles.dim]}>
          <ProfileHero
            user={feed.user}
            onEdit={() => router.push('/profile/edit')}
            onChangeCover={() => setImageModal('cover')}
            onChangeAvatar={() => setImageModal('avatar')}
            frame={getFrame(equippedFrame) ?? null}
          />

          <SegmentedControl
            options={[
              { key: 'overview', label: 'Tổng quan' },
              { key: 'evidence', label: 'Minh chứng' },
            ]}
            selected={tab}
            onSelect={setTab}
          />

          {tab === 'overview' ? (
            <>
              <Card>
                <CardTitle
                  icon={BookOpen}
                  title="Một chút về mình"
                  right={<Heart size={18} color="#6B7280" />}
                />
                {feed.user.bio ? (
                  <Text style={styles.bio}>{feed.user.bio}</Text>
                ) : (
                  <Text style={styles.bioEmpty}>
                    Bạn chưa điền thông tin giới thiệu bản thân.
                  </Text>
                )}
              </Card>

              <StatGrid stats={feed.stats} />
              <CompetencyCard data={feed.competency} />
              <SkillsCard skills={feed.skills} />
              <ClubsCard clubs={feed.clubs} />
            </>
          ) : (
            <EvidenceTab />
          )}

          <Pressable
            style={styles.logoutButton}
            onPress={() =>
              Alert.alert('Đăng xuất', `Bạn có muốn đăng xuất khỏi ${user?.email ?? 'tài khoản này'}?`, [
                { text: 'Hủy', style: 'cancel' },
                { text: 'Đăng xuất', style: 'destructive', onPress: () => void signOut() },
              ])
            }
            accessibilityRole="button">
            <Text style={styles.logoutText}>Đăng xuất</Text>
          </Pressable>
        </View>
      )}

      {imageModal ? (
        <ProfileImageModal
          visible
          kind={imageModal}
          user={user}
          selfProfile={feed?.selfProfile ?? null}
          onClose={() => setImageModal(null)}
          onSaved={retry}
          // Phase 6a (chỉ hiệu lực khi kind='avatar'):
          inventory={inventory}
          equippedFrame={equippedFrame}
          onSelectFrame={handleSelectFrame}
          onOpenRewards={openRewards}
          avatarUrl={feed?.user.avatarUrl ?? null}
          initials={feed?.user.initials ?? ''}
        />
      ) : null}

      <RewardsSheet
        visible={rewardsOpen}
        onClose={() => setRewardsOpen(false)}
        inventory={inventory}
        onInventoryChanged={handleInventoryChanged}
      />
    </ScreenLayout>
  );
}

const styles = StyleSheet.create({
  campus: { paddingHorizontal: 16, paddingTop: 4 },
  content: { gap: 0 },
  dim: { opacity: 0.5 },
  loader: { marginTop: 40 },
  bio: { fontSize: 13, lineHeight: 20, color: '#4B5563', marginTop: 12 },
  bioEmpty: { fontSize: 13, lineHeight: 20, color: '#9CA3AF', marginTop: 12 },
  logoutButton: {
    marginHorizontal: 16,
    marginTop: 24,
    height: 46,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFF1F2',
    borderWidth: 1,
    borderColor: '#FECDD3',
  },
  logoutText: { color: '#BE123C', fontSize: 14, fontWeight: '800' },
});
