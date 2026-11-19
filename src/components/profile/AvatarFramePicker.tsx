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
import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import AvatarFrameOverlay from '@/components/profile/AvatarFrameOverlay';
import { AVATAR_FRAMES, type FrameItem } from '@/components/profile/avatarFrames';
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
      {/* Avatar + overlay khung CHỒNG LÊN nhau (mirror web: wrapper relative,
          overlay absolute inset -6% để vòng khung nằm ngoài viền trắng).
          Khoá → vẫn preview khung thật + lock badge (web: "Đang xem thử..."). */}
      <View style={styles.preview}>
        <View style={styles.avatarWrap}>
          <View style={styles.avatarBg}>
            {avatarUrl ? (
              <Image source={{ uri: avatarUrl }} style={styles.avatarImage} contentFit="cover" />
            ) : initials ? (
              <Text style={styles.initials}>{initials}</Text>
            ) : null}
          </View>
          {/* Overlay tuyệt đối, cùng tâm với avatar (frame = avatar + 8px). */}
          <View style={styles.frameLayer} pointerEvents="none">
            <AvatarFrameOverlay frame={frame} size={size} />
          </View>
        </View>
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
            ? 'Đã sở hữu'
            : `🔒 ${frame.cost} điểm tại CLB`}
      </Text>
    </Pressable>
  );
}

// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  heading: { fontSize: 14, fontWeight: '800', color: '#111827', marginBottom: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  cell: {
    width: 96,
    alignItems: 'center',
    gap: 6,
    padding: 8,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  cellEquipped: { borderColor: '#F97316', backgroundColor: '#FFF7ED' },
  cellLocked: { opacity: 0.85 },
  preview: { width: 72, height: 72, alignItems: 'center', justifyContent: 'center' },
  // Wrapper giữ avatar + overlay tuyệt đối (mirror web: .v2-framed-avatar +
  // .v2-avatar-frame-overlay absolute). Preview 64px + 8px để vòng khung nằm
  // ngoài viền (khớp constant size = 64 trong FrameCell).
  avatarWrap: { width: 72, height: 72, alignItems: 'center', justifyContent: 'center' },
  // Phải CENTER: SVG 64px nằm trong layer 72px — thiếu center sẽ dính góc
  // trái-trên và lệch khỏi tâm avatar.
  frameLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 72,
    height: 72,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarBg: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#8B3A1F',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImage: { width: '100%', height: '100%' },
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
