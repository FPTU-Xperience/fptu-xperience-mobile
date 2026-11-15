// components/profile/RewardsSheet.tsx
//
// Sheet "Kho quà CLB" (Phase 6b) — server-backed (bỏ hẳn localStorage mock 200-point
// của web). Flow:
//   1. Chọn CLB (danh sách membership approved của tôi)
//   2. Hiện số dư CLUB_CREDIT (wallet) + catalog quà PUBLISHED
//   3. "Đổi quà" → POST .../redeem (idempotent + CAS 409 STALE_* → refetch retry)
//   4. Đổi thành công → cập nhật wallet + inventory (sở hữu mới), hiện biên lai
//
// Nguồn:
//   - fetchApprovedClubs (profile.ts) → danh sách CLB có thể chọn
//   - fetchClubWallet / fetchClubRewards / fetchMyCosmetics / redeemReward (rewards.ts)

import { Check, Gift, Wallet } from 'lucide-react-native';
import { useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import ErrorState from '@/components/common/ErrorState';
import { useApiState } from '@/hooks/useApiState';
import { getApiErrorMessage } from '@/services/apiClient';
import { fetchApprovedClubs } from '@/services/profile';
import {
  fetchClubRewards,
  fetchClubWallet,
  grantLabels,
  redeemReward,
  rewardFullyOwned,
} from '@/services/rewards';
import type {
  ClubCreditWallet,
  ClubRewardCatalogPage,
  ClubRewardItem,
  CosmeticInventoryPage,
} from '@/types/api';

type Props = {
  visible: boolean;
  onClose: () => void;
  /** Kho cosmetics hiện tại (chia sẻ với FramePicker) — để tính "đã sở hữu". */
  inventory: CosmeticInventoryPage | null;
  /** Gọi khi sở hữu đổi (sau redeem) để cập nhật khung được mở. */
  onInventoryChanged: () => void;
};

export default function RewardsSheet({ visible, onClose, inventory, onInventoryChanged }: Props) {
  // CLB của tôi (chọn được) — fetch 1 lần khi mở sheet.
  const clubs = useApiState(() => fetchApprovedClubs(), []);

  // CLB được chọn (null = dùng CLB đầu tiên — tính dẫn xuất, không cần effect).
  const [selectedClubId, setSelectedClubId] = useState<number | null>(null);
  const firstClubId =
    clubs.data && clubs.data.length > 0 ? Number(clubs.data[0].id) : null;
  const clubId = selectedClubId ?? firstClubId;

  // Kho cosmetics (sở hữu) — giá trị prop (màn Profile refresh sau redeem).
  // Đổi quà xong → onInventoryChanged() (màn cha refetch; prop mới tự cập nhật).

  // Wallet + catalog của CLB đang chọn.
  const wallet = useApiState<ClubCreditWallet | null>(
    () => (clubId ? fetchClubWallet(clubId) : Promise.resolve(null)),
    [clubId],
  );
  const catalog = useApiState<ClubRewardCatalogPage | null>(
    () => (clubId ? fetchClubRewards(clubId) : Promise.resolve(null)),
    [clubId],
  );

  const balance = wallet.data?.balance ?? 0;
  const rewards = catalog.data?.items ?? [];
  const canRedeem = catalog.data?.capabilities.canRedeem ?? false;

  // State redeem đang chạy + biên lai mới (toast).
  const [redeeming, setRedeeming] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const redeem = async (reward: ClubRewardItem) => {
    if (clubId === null || !wallet.data || redeeming) return;
    setRedeeming(reward.id);
    setToast(null);
    try {
      const receipt = await redeemReward({
        clubId,
        reward,
        walletVersion: wallet.data.version,
      });
      // Sở hữu mới (khung mở + "Đã đổi") — màn cha refetch inventory (prop).
      onInventoryChanged();
      setToast(`Đã đổi "${receipt.rewardLabel}".`);
    } catch (err) {
      setToast(getApiErrorMessage(err));
    } finally {
      setRedeeming(null);
    }
  };

  // Sở hữu (giá trị từ inventory prop — refresh sau redeem qua onInventoryChanged).
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={styles.backdropTap} onPress={onClose} />

        <View style={styles.sheet}>
          {/* Header + số dư */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <Gift size={18} color="#F97316" />
              <Text style={styles.headerTitle}>Kho quà CLB</Text>
            </View>
            <Text style={styles.headerSub}>Đổi quà bằng điểm CLB</Text>
          </View>

          {/* Chọn CLB */}
          {clubs.data && clubs.data.length > 0 ? (
            <View style={styles.clubRow}>
              {clubs.data.map((c) => {
                const active = Number(c.id) === clubId;
                return (
                  <Pressable
                    key={c.id}
                    onPress={() => {
                      setSelectedClubId(Number(c.id));
                    }}
                    style={[styles.chip, active && styles.chipActive]}>
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>
                      {c.name}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}

          {/* Số dư */}
          {wallet.data ? (
            <View style={styles.balance}>
              <View style={styles.balanceLeft}>
                <Wallet size={16} color="#C2410C" />
                <View>
                  <Text style={styles.balanceLabel}>Số dư {wallet.data.unit}</Text>
                  <Text style={styles.balanceValue}>
                    {balance} điểm
                    {balance < 0 ? ' (nợ)' : ''}
                  </Text>
                </View>
              </View>
              <Text style={styles.balanceHint}>= điểm CLB đã xác thực (1-1)</Text>
            </View>
          ) : null}

          {/* Thân */}
          {clubs.hasError ? (
            <ErrorState message={clubs.error ?? ''} onRetry={clubs.retry} loading={clubs.loading} />
          ) : clubs.loading && !clubs.data ? (
            <ActivityIndicator color="#F97316" style={styles.loader} />
          ) : clubs.data && clubs.data.length === 0 ? (
            <EmptyView
              title="Bạn chưa là thành viên CLB nào"
              subtitle="Đổi quà khi đã được duyệt vào ít nhất một CLB."
            />
          ) : clubId === null ? (
            <EmptyView title="Chọn CLB phía trên để xem kho quà." />
          ) : catalog.hasError ? (
            <ErrorState
              message={catalog.error ?? ''}
              onRetry={catalog.retry}
              loading={catalog.loading}
            />
          ) : catalog.loading ? (
            <ActivityIndicator color="#F97316" style={styles.loader} />
          ) : rewards.length === 0 ? (
            <EmptyView
              title="CLB này chưa mở quà nào"
              subtitle="Quà do CLB tạo và công bố; quay lại sau nhé."
            />
          ) : (
            <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
              {rewards.map((r) => {
                const isOwned = rewardFullyOwned(r, inventory);
                const open = r.availability === 'OPEN';
                const short = balance < r.price;
                const busy = redeeming === r.id;
                const affordable = open && !short && !isOwned;
                return (
                  <View key={r.id} style={styles.reward}>
                    <View style={styles.rewardBody}>
                      <Text style={styles.rewardLabel} numberOfLines={1}>
                        {r.label}
                      </Text>
                      <Text style={styles.rewardGrants}>
                        {r.kind === 'BUNDLE' ? 'Gói: ' : ''}
                        {grantLabels(r)}
                      </Text>
                      {r.description ? (
                        <Text style={styles.rewardDesc} numberOfLines={2}>
                          {r.description}
                        </Text>
                      ) : null}
                    </View>

                    <View style={styles.rewardRight}>
                      <Text style={styles.rewardPrice}>{r.price}</Text>
                      <Text style={styles.rewardPriceUnit}>điểm</Text>

                      {isOwned ? (
                        <View style={styles.ownedBadge}>
                          <Check size={13} color="#15803D" />
                          <Text style={styles.ownedText}>Đã đổi</Text>
                        </View>
                      ) : (
                        <Pressable
                          style={[
                            styles.redeemBtn,
                            (!affordable || busy) && styles.redeemBtnDisabled,
                          ]}
                          onPress={() => redeem(r)}
                          disabled={!affordable || busy || !canRedeem}>
                          {busy ? (
                            <ActivityIndicator size="small" color="#fff" />
                          ) : short ? (
                            <Text style={styles.redeemText}>Thiếu điểm</Text>
                          ) : !open ? (
                            <Text style={styles.redeemText}>
                              {r.availability === 'SCHEDULED'
                                ? 'Chưa mở'
                                : r.availability === 'EXPIRED'
                                  ? 'Đã kết thúc'
                                  : 'Khả dụng'}
                            </Text>
                          ) : (
                            <Text style={styles.redeemText}>Đổi quà</Text>
                          )}
                        </Pressable>
                      )}
                    </View>
                  </View>
                );
              })}
            </ScrollView>
          )}

          {/* Biên lai / toast */}
          {toast ? (
            <Text style={styles.toast} numberOfLines={2}>
              {toast}
            </Text>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

// ---------------------------------------------------------------------------

function EmptyView({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyTitle}>{title}</Text>
      {subtitle ? <Text style={styles.emptyDesc}>{subtitle}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(17,24,39,0.45)', justifyContent: 'flex-end' },
  backdropTap: { flex: 1 },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 24,
    maxHeight: '82%',
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerTitle: { fontSize: 17, fontWeight: '800', color: '#111827' },
  headerSub: { fontSize: 12, color: '#6B7280' },

  clubRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 16 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#F3F4F8',
    borderWidth: 1,
    borderColor: 'transparent',
  },
  chipActive: { backgroundColor: '#FFF1E6', borderColor: '#F97316' },
  chipText: { fontSize: 12.5, fontWeight: '700', color: '#6B7280' },
  chipTextActive: { color: '#C2410C' },

  balance: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 14,
    padding: 14,
    borderRadius: 14,
    backgroundColor: '#FFF7ED',
  },
  balanceLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  balanceLabel: { fontSize: 11, color: '#9A3412' },
  balanceValue: { fontSize: 18, fontWeight: '800', color: '#C2410C' },
  balanceHint: { fontSize: 10.5, color: '#9CA3AF', textAlign: 'right', flexShrink: 1 },

  loader: { marginTop: 32 },
  list: { marginTop: 14, gap: 10 },
  reward: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    padding: 14,
    borderRadius: 14,
    backgroundColor: '#F3F4F8',
  },
  rewardBody: { flex: 1, gap: 2 },
  rewardLabel: { fontSize: 14, fontWeight: '800', color: '#111827' },
  rewardGrants: { fontSize: 11.5, color: '#6B7280' },
  rewardDesc: { fontSize: 11, color: '#9CA3AF', marginTop: 2 },
  rewardRight: { alignItems: 'flex-end', justifyContent: 'space-between' },
  rewardPrice: { fontSize: 16, fontWeight: '800', color: '#C2410C' },
  rewardPriceUnit: { fontSize: 10, color: '#9CA3AF', marginBottom: 8 },
  ownedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#DCFCE7',
  },
  ownedText: { fontSize: 11.5, fontWeight: '700', color: '#15803D' },
  redeemBtn: {
    minWidth: 88,
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: '#F97316',
    alignItems: 'center',
    justifyContent: 'center',
  },
  redeemBtnDisabled: { opacity: 0.5 },
  redeemText: { color: '#fff', fontSize: 12.5, fontWeight: '800' },

  empty: { paddingVertical: 32, alignItems: 'center', gap: 6 },
  emptyTitle: { fontSize: 14, fontWeight: '800', color: '#111827' },
  emptyDesc: { fontSize: 12, color: '#6B7280', textAlign: 'center', lineHeight: 18 },
  toast: {
    marginTop: 14,
    fontSize: 12,
    color: '#374151',
    backgroundColor: '#F3F4F8',
    padding: 12,
    borderRadius: 12,
    textAlign: 'center',
  },
});
