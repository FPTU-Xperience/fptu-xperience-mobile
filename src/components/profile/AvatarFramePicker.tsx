// components/profile/AvatarFramePicker.tsx
//
// Tab "Khung" trong modal avatar (Phase 6a):
//   - Danh sách khung: free (equip ngay) + FPT-DEV (khóa cho đến khi sở hữu)
//   - Sở hữu = server-backed (inventory cosmetics); chưa sở hữu → hiện giá
//     + banner "Đổi tại Kho quà CLB" (link sang RewardsSheet — Phase 6b)
//   - Chọn khung → lưu lựa chọn device-local (frameState.saveFrame, SecureStore)
//
// Preview: overlay SVG (AvatarFrameOverlay) trên nền avatar (màu + initials).

import { Check, Lock } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import AvatarFrameOverlay from '@/components/profile/AvatarFrameOverlay';
import { AVATAR_FRAMES, getFrame, type FrameItem } from '@/components/profile/avatarFrames';
import type { CosmeticInventoryPage } from '@/types/api';
import { frameUnlocked } from '@/services/frameState';

type Props = {
  userId: string;
  /** Kho cosmetics (null = chưa tải được → chỉ khung free equip được). */
  inventory: CosmeticInventoryPage | null;
  /** Khung hiện equip (từ frameState). */
  equipped: string;
  /** Chọn khung (component cha lưu + cập nhật state + trigger re-render hero). */
  onSelect: (frameId: string) => void;
  /** Mở sheet Kho quà (đổi khung rewards tại đây). */
  onOpenRewards: () => void;
  /** Avatar thật + initials (nền preview). */
  avatarUrl: string | null;
  initials: string;
};

export default function AvatarFramePicker({
  inventory,
  equipped,
  onSelect,
  onOpenRewards,
  avatarUrl,
  initials,
}: Props) {
  return (
    <View>
      <Text style={styles.heading}>Chọn khung ảnh cá nhân</Text>

      <View style={styles.grid}>
        {AVATAR_FRAMES.map((frame) => (
          <FrameCell
            key={frame.id}
            frame={frame}
            unlocked={frameUnlocked(frame.id, inventory)}
            equipped={equipped === frame.id}
            avatarUrl={avatarUrl}
            initials={initials}
            onPress={() => onSelect(frame.id)}
            onOpenRewards={onOpenRewards}
          />
        ))}
      </View>

      {/* Banner đổi khung rewards — link sang Kho quà CLB (6b). */}
      <Pressable
        style={styles.banner}
        onPress={onOpenRewards}
        hitSlop={4}>
        <Text style={styles.bannerText}>
          Chưa mở khóa khung FPT-DEV? Đổi tại <Text style={styles.bannerLink}>Kho quà CLB</Text> bằng điểm CLB.
        </Text>
      </Pressable>
    </View>
  );
}

// ---------------------------------------------------------------------------

type CellProps = {
  frame: FrameItem;
  unlocked: boolean;
  equipped: boolean;
  avatarUrl: string | null;
  initials: string;
  onPress: () => void;
  onOpenRewards: () => void;
};

function FrameCell({ frame, unlocked, equipped, avatarUrl, initials, onPress, onOpenRewards }: CellProps) {
  const previewId = unlocked ? frame.id : 'none'; // khóa → preview không khung
  const preview = getFrame(previewId);
  const size = 64;

  // Hành vi: free → chọn ngay; rewards đã sở hữu → chọn; khóa → mở Kho quà.
  const handlePress = () => {
    if (unlocked) onPress();
    else onOpenRewards();
  };

  return (
    <Pressable
      style={[styles.cell, equipped && styles.cellEquipped, !unlocked && styles.cellLocked]}
      onPress={handlePress}
      hitSlop={4}>
      {/* Avatar + overlay khung (khóa thì overlay mờ + lock badge). */}
      <View style={styles.preview}>
        <View style={styles.avatarBg}>
          {initials ? <Text style={styles.initials}>{initials}</Text> : null}
        </View>
        <AvatarFrameOverlay frame={preview ?? null} size={size} />
        {!unlocked ? (
          <View style={styles.lockBadge}>
            <Lock size={13} color="#F97316" />
          </View>
        ) : null}
        {equipped && unlocked ? (
          <View style={styles.checkBadge}>
            <Check size={12} color="#fff" />
          </View>
        ) : null}
      </View>

      <Text style={styles.cellLabel} numberOfLines={1}>
        {frame.label}
      </Text>
      <Text style={styles.cellMeta}>
        {frame.free
          ? 'Miễn phí'
          : unlocked
            ? 'Đã mở khóa'
            : `${frame.cost} điểm · ${frame.clubName ?? 'CLB'}`}
      </Text>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  heading: { fontSize: 14, fontWeight: '800', color: '#111827', marginBottom: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  cell: {
    width: 84,
    alignItems: 'center',
    gap: 6,
    padding: 8,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  cellEquipped: { borderColor: '#F97316', backgroundColor: '#FFF7ED' },
  cellLocked: { opacity: 0.85 },
  preview: { width: 64, height: 64, alignItems: 'center', justifyContent: 'center' },
  avatarBg: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#8B3A1F',
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: { color: '#fff', fontSize: 18, fontWeight: '800' },
  lockBadge: {
    position: 'absolute',
    top: 0,
    right: 4,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#FED7AA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkBadge: {
    position: 'absolute',
    top: 0,
    right: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#F97316',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellLabel: { fontSize: 11, fontWeight: '700', color: '#111827', textAlign: 'center' },
  cellMeta: { fontSize: 10, color: '#9CA3AF', textAlign: 'center' },
  banner: {
    marginTop: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#FFF7ED',
    borderWidth: 1,
    borderColor: '#FFD9B3',
  },
  bannerText: { fontSize: 12, color: '#9A3412', lineHeight: 18 },
  bannerLink: { color: '#C2410C', fontWeight: '800' },
});
