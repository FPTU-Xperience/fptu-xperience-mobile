// components/profile/ProfileHero.tsx
import { Camera, ImageIcon, MapPin, Pencil } from 'lucide-react-native';
import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import AvatarFrameOverlay from '@/components/profile/AvatarFrameOverlay';
import type { FrameItem } from '@/components/profile/avatarFrames';
import type { ProfileUser } from '@/types/profile';

type Props = {
  user: ProfileUser;
  onEdit?: () => void;
  onChangeCover?: () => void;
  onChangeAvatar?: () => void;
  /** Khung avatar đang equip (Phase 6a); null/undefined = không khung. */
  frame?: FrameItem | null;
};

export default function ProfileHero({
  user,
  onEdit,
  onChangeCover,
  onChangeAvatar,
  frame,
}: Props) {
  return (
    <View>
      {/* Ảnh bìa — ảnh thật nếu có, không thì fallback màu + coverText */}
      <View style={styles.cover}>
        {user.coverImageUrl ? (
          <Image
            source={{ uri: user.coverImageUrl }}
            style={styles.coverImage}
            contentFit="cover"
            transition={200}
          />
        ) : (
          <Text style={styles.coverText}>{user.coverText}</Text>
        )}
        <Pressable style={styles.coverButton} onPress={onChangeCover}>
          <ImageIcon size={12} color="#6B7280" />
          <Text style={styles.coverButtonText}>Đổi ảnh bìa</Text>
        </Pressable>
      </View>

      {/* Avatar + trạng thái — ảnh thật nếu có, không thì initials-circle */}
      <View style={styles.avatarRow}>
        <View>
          {/* Khung avatar (Phase 6a): overlay SVG tuyệt đối lên avatar (không che
              ảnh, không chặn gesture — pointerEvents). Kích thước = avatar + viền. */}
          <View style={styles.avatarWrap}>
            <View style={styles.avatar}>
              {user.avatarUrl ? (
                <Image
                  source={{ uri: user.avatarUrl }}
                  style={styles.avatarImage}
                  contentFit="cover"
                  transition={200}
                />
              ) : (
                <Text style={styles.avatarText}>{user.initials}</Text>
              )}
            </View>
            <View style={styles.frameLayer} pointerEvents="none">
              <AvatarFrameOverlay frame={frame ?? null} size={AVATAR + 8} />
            </View>
          </View>
          <Pressable style={styles.camera} onPress={onChangeAvatar}>
            <Camera size={12} color="#fff" />
          </Pressable>
        </View>
      </View>

      {/* Thông tin */}
      <View style={styles.info}>
        <View style={styles.nameRow}>
          <Text style={styles.name}>{user.name}</Text>
        </View>
        <Text style={styles.sub}>
          {user.major} · {user.cohort} · {user.campusCode}
        </Text>
        <View style={styles.locationRow}>
          <MapPin size={13} color="#F97316" />
          <Text style={styles.location}>
            {user.university} · {user.campusName}
          </Text>
        </View>
      </View>

      {/* Nút — "Xem view công khai" đã bỏ theo quyết định (plan). */}
      <View style={styles.actions}>
        <Pressable style={[styles.button, styles.primary]} onPress={onEdit}>
          <Pencil size={14} color="#fff" />
          <Text style={styles.primaryText}>Chỉnh sửa</Text>
        </Pressable>
      </View>
    </View>
  );
}

const AVATAR = 88;

const styles = StyleSheet.create({
  cover: {
    height: 110,
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 20,
    backgroundColor: '#FDE7CF',
    padding: 16,
    justifyContent: 'center',
    overflow: 'hidden',
  },
  coverImage: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    height: '100%',
  },
  coverText: { fontSize: 15, fontWeight: '800', color: '#7C2D12', lineHeight: 20 },
  coverButton: {
    position: 'absolute',
    right: 12,
    bottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.85)',
  },
  coverButtonText: { fontSize: 10.5, fontWeight: '600', color: '#6B7280' },

  avatarRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: 28,
    marginTop: -AVATAR / 2,
  },
  avatar: {
    width: AVATAR,
    height: AVATAR,
    borderRadius: AVATAR / 2,
    backgroundColor: '#8B3A1F',
    borderWidth: 4,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  // Khung avatar (6a): wrapper giữ avatar + overlay tuyệt đối (lớn hơn để
  // vòng khung nằm ngoài viền trắng). pointerEvents="none" ở frameLayer.
  avatarWrap: { width: AVATAR + 8, height: AVATAR + 8, alignItems: 'center', justifyContent: 'center' },
  frameLayer: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: AVATAR + 8,
    height: AVATAR + 8,
  },
  avatarImage: {
    width: '100%',
    height: '100%',
    borderRadius: AVATAR / 2,
  },
  avatarText: { color: '#fff', fontSize: 28, fontWeight: '800' },
  camera: {
    position: 'absolute',
    right: 0,
    bottom: 2,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#F97316',
    borderWidth: 2,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  status: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: '#DCFCE7',
    marginBottom: 8,
  },
  statusDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: '#22C55E' },
  statusText: { fontSize: 11, fontWeight: '700', color: '#15803D' },

  info: { paddingHorizontal: 20, marginTop: 8 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { fontSize: 26, fontWeight: '800', color: '#111827' },
  sub: { fontSize: 13, color: '#6B7280', marginTop: 4 },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6 },
  location: { fontSize: 12, fontWeight: '600', color: '#374151' },

  actions: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, marginTop: 16 },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 46,
    borderRadius: 14,
  },
  primary: { flex: 1, backgroundColor: '#F97316' },
  primaryText: { color: '#fff', fontSize: 14, fontWeight: '800' },
});