// components/profile/ProfileImageModal.tsx
//
// Modal thay ảnh cá nhân / ảnh bìa (Phase 3) + chọn khung avatar (Phase 6a).
//
// Ảnh (mirror web use-server-profile-images.js):
//   1. Chọn ảnh: camera hoặc thư viện (expo-image-picker, base64: true)
//   2. Xem trước ảnh đã chọn
//   3. "Lưu ảnh": upload-intents → PUT bytes lên S3/R2 (raw fetch)
//      → PATCH /api/users/me/profile (staging publicUrl + Idempotency-Key)
//      → onSaved() (màn Profile retry feed để thấy ảnh mới + version mới)
//
// Ảnh phải PNG/JPEG/WebP ≤ 5 MB (giới hạn backend). Preview dùng asset.uri
// (file:// — expo-image đọc trực tiếp) thay vì nhúng data URI 5MB vào JSX.
//
// Khung (Phase 6a, chỉ kind='avatar'): tab "Khung" hiển thị AvatarFramePicker
// (chọn/equip khung — lưu device-local, server-backed ownership). Nút "Đổi
// khung" mở RewardsSheet (6b). Không đụng ảnh (flow save độc lập).

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
import { Camera, Image as ImageIcon, Library, X } from 'lucide-react-native';
import { Image } from 'expo-image';
import {
  launchCameraAsync,
  launchImageLibraryAsync,
  requestCameraPermissionsAsync,
  requestMediaLibraryPermissionsAsync,
  type ImagePickerAsset,
} from 'expo-image-picker';

import {
  MAX_PROFILE_IMAGE_BYTES,
  base64ToUint8Array,
  createUploadIntent,
  putUploadFile,
  saveProfileImage,
  type ProfileImageKind,
} from '@/services/profile-media';
import type { AuthUser } from '@/types/auth';
import type { SelfProfileResponse, CosmeticInventoryPage } from '@/types/api';
import AvatarFramePicker from '@/components/profile/AvatarFramePicker';

type Props = {
  visible: boolean;
  kind: ProfileImageKind;
  user: AuthUser | null;
  /** Hồ sơ chuẩn hiện tại (có version + editableFields); null → service tự refetch. */
  selfProfile: SelfProfileResponse | null;
  onClose: () => void;
  /** Gọi sau khi PATCH thành công — màn gọi lại fetch profile. */
  onSaved: () => void;

  // --- Phase 6a: khung (chỉ hiệu lực khi kind='avatar') ---
  /** Kho cosmetics (server) — tính "khung nào mở được". */
  inventory?: CosmeticInventoryPage | null;
  /** frameId đang equip (từ frameState). */
  equippedFrame?: string;
  /** Chọn khung (màn lưu frameState + refresh hero). */
  onSelectFrame?: (frameId: string) => void;
  /** Mở sheet Kho quà (đổi khung rewards). */
  onOpenRewards?: () => void;
  /** Avatar URL + initials (nền preview khung). */
  avatarUrl?: string | null;
  initials?: string;
};

type SaveStage = 'idle' | 'intent' | 'upload' | 'patch';

const STAGE_LABEL: Record<SaveStage, string> = {
  idle: '',
  intent: 'Đang xin quyền tải ảnh…',
  upload: 'Đang tải ảnh lên…',
  patch: 'Đang lưu vào hồ sơ…',
};

export default function ProfileImageModal({
  visible,
  kind,
  user,
  selfProfile,
  onClose,
  onSaved,
  inventory = null,
  equippedFrame = 'none',
  onSelectFrame,
  onOpenRewards,
  avatarUrl = null,
  initials = '',
}: Props) {
  const [asset, setAsset] = useState<ImagePickerAsset | null>(null);
  const [stage, setStage] = useState<SaveStage>('idle');
  const [error, setError] = useState<string | null>(null);

  // Tab (chỉ khi kind='avatar' + có frame handler). 'image' = tab ảnh (default).
  const frameEnabled =
    kind === 'avatar' && !!onSelectFrame && !!onOpenRewards;
  const [tab, setTab] = useState<'image' | 'frame'>('image');

  const activeTab = frameEnabled ? tab : 'image';

  const title = kind === 'avatar' ? 'Đổi ảnh cá nhân' : 'Đổi ảnh bìa';
  const busy = stage !== 'idle';

  const reset = () => {
    setAsset(null);
    setStage('idle');
    setError(null);
    setTab('image');
  };

  const close = () => {
    if (busy) return; // chặn đóng giữa chừng upload
    reset();
    onClose();
  };

  /** Chuẩn hoá ảnh picked: kiểm tra loại + size + đọc bytes. */
  const prepare = async (picked: ImagePickerAsset | null) => {
    if (!picked?.base64) return;
    const bytes = base64ToUint8Array(picked.base64);
    if (bytes.length > MAX_PROFILE_IMAGE_BYTES) {
      setError(`Ảnh quá lớn (tối đa ${Math.floor(MAX_PROFILE_IMAGE_BYTES / 1024 / 1024)} MB). Hãy chọn ảnh nhỏ hơn.`);
      return;
    }
    const mimeType = picked.mimeType || 'image/jpeg';
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(mimeType)) {
      setError('Ảnh phải là PNG, JPEG hoặc WebP.');
      return;
    }
    setAsset({ ...picked, mimeType });
    setError(null);
  };

  const pickCamera = async () => {
    setError(null);
    const permission = await requestCameraPermissionsAsync();
    if (!permission.granted) {
      setError('Bạn cần cấp quyền camera để chụp ảnh.');
      return;
    }
    const result = await launchCameraAsync({ base64: true });
    if (result.canceled || !result.assets?.length) return;
    await prepare(result.assets[0]);
  };

  const pickLibrary = async () => {
    setError(null);
    const permission = await requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      setError('Bạn cần cấp quyền thư viện ảnh để chọn ảnh.');
      return;
    }
    const result = await launchImageLibraryAsync({ base64: true });
    if (result.canceled || !result.assets?.length) return;
    await prepare(result.assets[0]);
  };

  const save = async () => {
    if (!asset || !asset.base64 || !user || busy) return;
    setError(null);

    const mimeType = asset.mimeType || 'image/jpeg';
    const bytes = base64ToUint8Array(asset.base64);

    try {
      setStage('intent');
      const intent = await createUploadIntent(kind, user.id, mimeType, bytes.length);

      setStage('upload');
      await putUploadFile(intent, bytes, mimeType);

      setStage('patch');
      await saveProfileImage({
        kind,
        userId: user.id,
        publicUrl: intent.publicUrl,
        version: selfProfile?.version ?? null,
        editableFields: selfProfile?.editableFields ?? null,
      });

      reset();
      onSaved();
    } catch (err) {
      setStage('idle');
      // Thông điệp tiếng Việt: ApiError đã map sẵn (STALE_PROFILE…), Error thường thì message thẳng.
      setError(err instanceof Error ? err.message : 'Không lưu được ảnh. Vui lòng thử lại.');
    }
  };

  const previewSource =
    asset?.uri ||
    (kind === 'avatar' ? selfProfile?.profile.avatarUrl : selfProfile?.profile.coverImageUrl) ||
    null;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={close}>
      <View style={styles.backdrop}>
        <Pressable style={styles.backdropTap} onPress={close} disabled={busy} />
        <View style={styles.sheet}>
          <View style={styles.header}>
            <Text style={styles.title}>{title}</Text>
            <Pressable style={styles.close} onPress={close} hitSlop={8} disabled={busy}>
              <X size={18} color="#6B7280" />
            </Pressable>
          </View>

          {/* Tab (chỉ khi khung được bật) */}
          {frameEnabled ? (
            <View style={styles.tabRow}>
              {(['image', 'frame'] as const).map((t) => {
                const active = activeTab === t;
                return (
                  <Pressable
                    key={t}
                    style={[styles.tab, active && styles.tabActive]}
                    onPress={() => setTab(t)}
                    hitSlop={4}>
                    <Text style={[styles.tabText, active && styles.tabTextActive]}>
                      {t === 'image' ? 'Ảnh' : 'Khung'}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ) : null}

          {activeTab === 'image' ? (
            <>
              {/* Xem trước: ảnh mới (file://) hoặc ảnh hiện tại (URL server) */}
              <View style={styles.previewWrap}>
                {kind === 'avatar' ? (
                  <View style={styles.previewCircle}>
                    {previewSource ? (
                      <Image
                        source={{ uri: previewSource }}
                        style={styles.previewImage}
                        contentFit="cover"
                      />
                    ) : (
                      <View style={styles.previewPlaceholder}>
                        <ImageIcon size={26} color="#9CA3AF" />
                      </View>
                    )}
                  </View>
                ) : (
                  <View style={styles.previewCover}>
                    {previewSource ? (
                      <Image
                        source={{ uri: previewSource }}
                        style={styles.previewImage}
                        contentFit="cover"
                      />
                    ) : (
                      <View style={styles.previewPlaceholder}>
                        <ImageIcon size={26} color="#9CA3AF" />
                      </View>
                    )}
                  </View>
                )}
                <Text style={styles.previewNote}>
                  {asset ? 'Ảnh mới đã chọn' : 'Ảnh hiện tại'} · PNG/JPEG/WebP ≤ 5 MB
                </Text>
              </View>

              {/* Chọn ảnh */}
              <View style={styles.pickers}>
                <Pressable
                  style={[styles.pickBtn, busy && styles.pickBtnDisabled]}
                  onPress={pickCamera}
                  disabled={busy}>
                  <Camera size={16} color="#F97316" />
                  <Text style={styles.pickText}>Chụp ảnh</Text>
                </Pressable>
                <Pressable
                  style={[styles.pickBtn, busy && styles.pickBtnDisabled]}
                  onPress={pickLibrary}
                  disabled={busy}>
                  <Library size={16} color="#F97316" />
                  <Text style={styles.pickText}>Thư viện</Text>
                </Pressable>
              </View>

              {error ? <Text style={styles.error}>{error}</Text> : null}

              {/* Lưu (3 bước hiện progress theo stage) */}
              <Pressable
                style={[styles.save, (!asset || busy) && styles.saveDisabled]}
                onPress={save}
                disabled={!asset || busy}>
                {busy ? (
                  <View style={styles.saveRow}>
                    <ActivityIndicator color="#fff" />
                    <Text style={styles.saveText}>{STAGE_LABEL[stage]}</Text>
                  </View>
                ) : (
                  <Text style={styles.saveText}>Lưu ảnh</Text>
                )}
              </Pressable>
            </>
          ) : (
            // Tab "Khung" (6a) — chọn equip khung (không đụng ảnh).
            // Wrap ScrollView: grid khung cao hơn màn → cuộn trong sheet thay vì
            // tràn ra ngoài (sheet chốt đáy, header ẩn ngoài màn).
            <ScrollView style={styles.frameScroll} contentContainerStyle={styles.frameScrollContent}>
              <AvatarFramePicker
                userId={user?.id ?? ''}
                inventory={inventory}
                equipped={equippedFrame}
                onSelect={(id) => onSelectFrame?.(id)}
                onOpenRewards={() => onOpenRewards?.()}
                avatarUrl={avatarUrl ?? null}
                initials={initials}
              />
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
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
    paddingBottom: 20,
    // Chốt cao sheet (grid khung 3 hàng dễ cao hơn màn) — phần nội dung
    // "Khung" tự cuộn bên trong, header không bao giờ bị tràn ra ngoài.
    maxHeight: '84%',
  },
  frameScroll: { flexShrink: 1 },
  frameScrollContent: { paddingTop: 12 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 17, fontWeight: '800', color: '#111827' },
  close: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },

  tabRow: {
    flexDirection: 'row',
    marginTop: 14,
    backgroundColor: '#F3F4F8',
    borderRadius: 12,
    padding: 3,
  },
  tab: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 9 },
  tabActive: { backgroundColor: '#fff' },
  tabText: { fontSize: 12.5, fontWeight: '700', color: '#6B7280' },
  tabTextActive: { color: '#C2410C' },

  previewWrap: { alignItems: 'center', marginTop: 16, gap: 8 },
  previewCircle: {
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 3,
    borderColor: '#F97316',
    overflow: 'hidden',
    backgroundColor: '#F3F4F8',
  },
  previewCover: {
    width: '100%',
    height: 110,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#FDE7CF',
  },
  previewImage: { width: '100%', height: '100%' },
  previewPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  previewNote: { fontSize: 11, color: '#9CA3AF' },

  pickers: { flexDirection: 'row', gap: 10, marginTop: 16 },
  pickBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 46,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FED7AA',
    backgroundColor: '#FFF7ED',
  },
  pickBtnDisabled: { opacity: 0.5 },
  pickText: { fontSize: 13, fontWeight: '700', color: '#9A3412' },

  error: {
    fontSize: 12,
    lineHeight: 18,
    color: '#DC2626',
    marginTop: 12,
    backgroundColor: '#FEF2F2',
    padding: 10,
    borderRadius: 10,
  },

  save: {
    marginTop: 16,
    height: 50,
    borderRadius: 14,
    backgroundColor: '#F97316',
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveDisabled: { opacity: 0.5 },
  saveRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  saveText: { color: '#fff', fontSize: 14, fontWeight: '800' },
});
