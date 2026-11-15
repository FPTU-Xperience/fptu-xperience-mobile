// components/profile/ProfileEditForm.tsx
//
// Form chỉnh sửa hồ sơ 3 tab — mirror web `EditProfileModal.jsx`:
//   Giới thiệu: displayName (required, ≤120), headline (≤160), about (≤2000),
//               skills / interests (text phân tách dấu phẩy → array, ≤30 mục, ≤100 ký tự/mục)
//   Cá nhân:    dateOfBirth (DD/MM/YYYY, không quá hôm nay), phoneNumber (≤20, [0-9+ ()-]),
//               address (≤300)
//   Học vụ:     major (SELECT từ 9 giá trị MAJORS — mobile cho sửa, khác web),
//               campus / cohort / studentCode read-only + nhãn "Chỉ đọc từ tài khoản học vụ"
//
// Gate `editableFields`: field nào KHÔNG có trong danh sách → disabled + nhãn
// "Chỉ đọc" (server vẫn enforce whitelist — đây chỉ là UX chặn sớm).
//
// Flow (đúng web): draft in-memory → "Xem trước" validate client → "Lưu thay đổi"
// → patchSelfProfile (409 STALE_PROFILE → retry 1 lần bên trong) → thành công
// gọi onSaved (route gọi lại fetch profile + dismiss); lỗi → hiện error, GIỮ draft.

import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Check, Eye, Lock } from 'lucide-react-native';

import { MAJORS, patchSelfProfile, type SelfProfilePatch } from '@/services/profile';
import type { SelfProfileResponse } from '@/types/api';

type EditTab = 'about' | 'personal' | 'academic';

type Props = {
  /** Hồ sơ chuẩn hiện tại (nguồn seed draft). */
  profile: SelfProfileResponse;
  /** Campus hiện tại (từ AuthUser.campus) — hiện ở tab Học vụ (read-only). */
  campus?: string;
  /** Gọi sau khi PATCH thành công. */
  onSaved: () => void;
  /** Chặn đóng khi đang lưu. */
  onClose: () => void;
};

/** Giới hạn backend (validate client + server enforce trùng). */
const LIMITS = {
  displayName: 120,
  headline: 160,
  about: 2000,
  phoneNumber: 20,
  address: 300,
  listItems: 30,
  listItemLength: 100,
} as const;

/** SĐT hợp lệ: tối đa 20 ký tự, chỉ [0-9+ ()-]. */
function isValidPhone(value: string): boolean {
  return value.length <= LIMITS.phoneNumber && /^[0-9+\s()-]*$/.test(value);
}

/**
 * Text phân tách dấu phẩy → array (trim, bỏ rỗng, ≤30 mục, ≤100 ký tự/mục).
 * Trả `string[]` — mảng rỗng = XÓA HẾT (backend chỉ nhận array, không nhận
 * null cho skills/interests — mirror web: "Clear all" gửi []).
 * @throws Error khi vượt giới hạn.
 */
function parseList(text: string, name: string): string[] {
  const items = text
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (items.length > LIMITS.listItems) {
    throw new Error(`${name} tối đa ${LIMITS.listItems} mục (phân cách bằng dấu phẩy).`);
  }
  for (const item of items) {
    if (item.length > LIMITS.listItemLength) {
      throw new Error(`Mỗi mục ${name} tối đa ${LIMITS.listItemLength} ký tự.`);
    }
  }
  return items;
}

/** DD/MM/YYYY → yyyy-MM-dd (backend parse exact + không quá hôm nay). */
function parseBirthDate(value: string): string {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
  if (!match) throw new Error('Ngày sinh cần theo định dạng DD/MM/YYYY.');
  const [, day, month, year] = match;
  const y = Number(year);
  const m = Number(month);
  const d = Number(day);
  const leap = y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0);
  const daysInMonth = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (y < 1 || m < 1 || m > 12 || d < 1 || d > daysInMonth[m - 1]) {
    throw new Error('Ngày sinh không hợp lệ. Vui lòng kiểm tra lại.');
  }
  const iso = `${year}-${month}-${day}`;
  if (iso > new Date().toISOString().slice(0, 10)) {
    throw new Error('Ngày sinh không thể trong tương lai.');
  }
  return iso;
}

/** yyyy-MM-dd → DD/MM/YYYY (display). */
function toDisplayDate(value: string | null | undefined): string {
  return value ? value.split('-').reverse().join('/') : '';
}

export default function ProfileEditForm({ profile, campus, onSaved, onClose }: Props) {
  const editable = useMemo(() => new Set(profile.editableFields), [profile.editableFields]);

  const [tab, setTab] = useState<EditTab>('about');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ---- Draft in-memory (seed từ profile hiện tại, skills/interests join ', ') ----
  const [displayName, setDisplayName] = useState(() => profile.profile.displayName ?? '');
  const [headline, setHeadline] = useState(() => profile.profile.headline ?? '');
  const [about, setAbout] = useState(() => profile.profile.about ?? '');
  const [skillsText, setSkillsText] = useState(() => profile.profile.skills.join(', '));
  const [interestsText, setInterestsText] = useState(() => profile.profile.interests.join(', '));
  const [dateOfBirth, setDateOfBirth] = useState(() => toDisplayDate(profile.personal.dateOfBirth));
  const [phoneNumber, setPhoneNumber] = useState(() => profile.personal.phoneNumber ?? '');
  const [address, setAddress] = useState(() => profile.personal.address ?? '');
  const [major, setMajor] = useState(() => profile.academic.major ?? '');

  const canEdit = (path: string): boolean => editable.has(path);

  // So draft với giá trị ban đầu → "Xem trước / Lưu" chỉ enable khi có thay đổi.
  const changed = useMemo(() => {
    const skillsInitial = profile.profile.skills.join(', ');
    const interestsInitial = profile.profile.interests.join(', ');
    const dobInitial = toDisplayDate(profile.personal.dateOfBirth);
    return (
      displayName.trim() !== (profile.profile.displayName ?? '').trim() ||
      headline.trim() !== (profile.profile.headline ?? '').trim() ||
      about.trim() !== (profile.profile.about ?? '').trim() ||
      skillsText.trim() !== skillsInitial.trim() ||
      interestsText.trim() !== interestsInitial.trim() ||
      dateOfBirth !== dobInitial ||
      phoneNumber.trim() !== (profile.personal.phoneNumber ?? '').trim() ||
      address.trim() !== (profile.personal.address ?? '').trim() ||
      major !== (profile.academic.major ?? '')
    );
  }, [
    displayName,
    headline,
    about,
    skillsText,
    interestsText,
    dateOfBirth,
    phoneNumber,
    address,
    major,
    profile,
  ]);

  /**
   * Validate client + build wire (CHỈ section bị đổi + CHỈ field editable).
   * Đúng web: "Xem trước" chạy validate này; "Lưu" gọi patchSelfProfile.
   */
  const buildPatch = (): SelfProfilePatch => {
    const initial = profile;
    const profileSection: SelfProfilePatch['profile'] = {};
    const personalSection: SelfProfilePatch['personal'] = {};
    const academicSection: SelfProfilePatch['academic'] = {};
    let hasChange = false;

    // ---- Giới thiệu ----
    const name = displayName.trim();
    if (canEdit('profile.displayName')) {
      if (!name) throw new Error('Tên hiển thị không được để trống.');
      if (name.length > LIMITS.displayName) {
        throw new Error(`Tên hiển thị tối đa ${LIMITS.displayName} ký tự.`);
      }
      if (name !== initial.profile.displayName?.trim()) {
        profileSection.displayName = name;
        hasChange = true;
      }
    }

    const hl = headline.trim();
    if (canEdit('profile.headline')) {
      if (hl.length > LIMITS.headline) {
        throw new Error(`Tiêu đề tối đa ${LIMITS.headline} ký tự.`);
      }
      if (hl !== (initial.profile.headline ?? '').trim()) {
        profileSection.headline = hl || null; // backend: rỗng → null (clear)
        hasChange = true;
      }
    }

    if (canEdit('profile.about') && about.trim() !== initial.profile.about?.trim()) {
      if (about.length > LIMITS.about) {
        throw new Error(`Giới thiệu bản thân tối đa ${LIMITS.about} ký tự.`);
      }
      profileSection.about = about.trim();
      hasChange = true;
    }

    const skillsChanged = skillsText.trim() !== initial.profile.skills.join(', ').trim();
    if (canEdit('profile.skills') && skillsChanged) {
      profileSection.skills = parseList(skillsText, 'Kỹ năng');
      hasChange = true;
    }

    const interestsChanged =
      interestsText.trim() !== initial.profile.interests.join(', ').trim();
    if (canEdit('profile.interests') && interestsChanged) {
      profileSection.interests = parseList(interestsText, 'Sở thích');
      hasChange = true;
    }

    // ---- Cá nhân ----
    const dobChanged = dateOfBirth !== toDisplayDate(initial.personal.dateOfBirth);
    if (canEdit('personal.dateOfBirth') && dobChanged) {
      // Rỗng = XÓA (gửi null — backend cho nullable dateOfBirth;
      // không gửi section rỗng { personal: {} } vì sẽ bị 400 EMPTY_PATCH).
      personalSection.dateOfBirth = dateOfBirth ? parseBirthDate(dateOfBirth) : null;
      hasChange = true;
    }

    const phone = phoneNumber.trim();
    if (canEdit('personal.phoneNumber') && phone !== (initial.personal.phoneNumber ?? '').trim()) {
      if (phone && !isValidPhone(phone)) {
        throw new Error('Số điện thoại tối đa 20 ký tự, chỉ gồm chữ số, dấu +, không gian, dấu trừ, dấu ngoặc.');
      }
      personalSection.phoneNumber = phone || null;
      hasChange = true;
    }

    const addr = address.trim();
    if (canEdit('personal.address') && addr !== (initial.personal.address ?? '').trim()) {
      if (addr.length > LIMITS.address) {
        throw new Error(`Địa chỉ tối đa ${LIMITS.address} ký tự.`);
      }
      personalSection.address = addr || null;
      hasChange = true;
    }

    // ---- Học vụ ----
    const majorChanged = major !== (initial.academic.major ?? '');
    if (canEdit('academic.major') && majorChanged) {
      if (major && !MAJORS.includes(major)) {
        throw new Error('Ngành học không hợp lệ.');
      }
      // LƯU Ý: backend KHÔNG cho clear major qua PATCH (academic.major không
      // nullable — IsMajor('') = false). UI dùng chip chọn-1 (không tắt được),
      // nên `major` luôn là một trong MAJORS; trường hợp rỗng chỉ là phòng thủ.
      academicSection.major = major;
      hasChange = true;
    }

    if (!hasChange) throw new Error('Không có thay đổi nào để lưu.');

    // Chỉ gắn section CÓ thay đổi (section rỗng {} gây noise; backend bỏ qua
    // nhưng không cần gửi — mirror web: chỉ diff).
    return {
      ...(Object.keys(profileSection).length ? { profile: profileSection } : {}),
      ...(Object.keys(personalSection).length ? { personal: personalSection } : {}),
      ...(Object.keys(academicSection).length ? { academic: academicSection } : {}),
    };
  };

  const preview = () => {
    try {
      const patch = buildPatch();
      const fieldCount =
        Object.keys(patch.profile ?? {}).length +
        Object.keys(patch.personal ?? {}).length +
        Object.keys(patch.academic ?? {}).length;
      Alert.alert(
        'Xem trước',
        `Thay đổi ${fieldCount} trường. Nhấn "Lưu thay đổi" để gửi tới máy chủ.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Dữ liệu không hợp lệ.');
    }
  };

  const save = async () => {
    if (saving || !changed) return;
    let patch: SelfProfilePatch;
    try {
      patch = buildPatch();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Dữ liệu không hợp lệ.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await patchSelfProfile({
        patch,
        version: profile.version,
        editableFields: profile.editableFields,
      });
      onSaved();
    } catch (err) {
      // Lỗi → hiện error, GIỮ draft (không reset).
      setError(err instanceof Error ? err.message : 'Không lưu được. Vui lòng thử lại.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.root}>
      {/* Tab switcher */}
      <View style={styles.tabs}>
        {(
          [
            ['about', 'Giới thiệu'],
            ['personal', 'Cá nhân'],
            ['academic', 'Học vụ'],
          ] as const
        ).map(([key, label]) => {
          const active = tab === key;
          return (
            <Pressable
              key={key}
              style={({ pressed }) => [
                styles.tab,
                active && styles.tabActive,
                pressed && !active && { opacity: 0.6 },
              ]}
              onPress={() => setTab(key)}>
              <Text style={[styles.tabText, active && styles.tabTextActive]}>
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled">
        {tab === 'about' && (
          <>
            <Text style={styles.note}>
              Thông tin hiển thị trên trang cá nhân. Chỉ bạn được chỉnh sửa.
            </Text>

            <Labeled
              label={`Tên hiển thị *${canEdit('profile.displayName') ? '' : ' · Chỉ đọc'}`}
              value={displayName}
              onChangeText={setDisplayName}
              editable={canEdit('profile.displayName')}
              maxLength={LIMITS.displayName}
              placeholder="Tên hiển thị"
            />

            <Labeled
              label={`Tiêu đề / câu nói tâm đắc${canEdit('profile.headline') ? '' : ' · Chỉ đọc'}`}
              value={headline}
              onChangeText={setHeadline}
              editable={canEdit('profile.headline')}
              maxLength={LIMITS.headline}
              placeholder="VD: Sinh viên FPTU đam mê AI"
            />

            <Labeled
              label={`Giới thiệu bản thân${canEdit('profile.about') ? '' : ' · Chỉ đọc'}`}
              value={about}
              onChangeText={setAbout}
              editable={canEdit('profile.about')}
              multiline
              maxLength={LIMITS.about}
              placeholder="Chia sẻ về bạn..."
            />

            <Labeled
              label={`Kỹ năng (phân cách bằng dấu phẩy)${canEdit('profile.skills') ? '' : ' · Chỉ đọc'}`}
              value={skillsText}
              onChangeText={setSkillsText}
              editable={canEdit('profile.skills')}
              placeholder="VD: Python, Machine Learning, Quản lý sự kiện"
            />

            <Labeled
              label={`Sở thích (phân cách bằng dấu phẩy)${canEdit('profile.interests') ? '' : ' · Chỉ đọc'}`}
              value={interestsText}
              onChangeText={setInterestsText}
              editable={canEdit('profile.interests')}
              placeholder="VD: Bóng rổ, Âm nhạc, Du lịch"
            />
          </>
        )}

        {tab === 'personal' && (
          <>
            <Text style={styles.note}>
              Thông tin cá nhân dùng khi đăng ký CLB. Chỉ bạn được chỉnh sửa.
            </Text>

            <Labeled
              label={`Ngày sinh (DD/MM/YYYY)${canEdit('personal.dateOfBirth') ? '' : ' · Chỉ đọc'}`}
              value={dateOfBirth}
              onChangeText={setDateOfBirth}
              editable={canEdit('personal.dateOfBirth')}
              placeholder="VD: 01/01/2004"
              keyboardType="numeric"
            />

            <Labeled
              label={`Số điện thoại${canEdit('personal.phoneNumber') ? '' : ' · Chỉ đọc'}`}
              value={phoneNumber}
              onChangeText={setPhoneNumber}
              editable={canEdit('personal.phoneNumber')}
              maxLength={LIMITS.phoneNumber}
              placeholder="VD: 0912345678"
              keyboardType="phone-pad"
            />

            <Labeled
              label={`Địa chỉ${canEdit('personal.address') ? '' : ' · Chỉ đọc'}`}
              value={address}
              onChangeText={setAddress}
              editable={canEdit('personal.address')}
              multiline
              maxLength={LIMITS.address}
              placeholder="VD: Số 1, Đường 2, Quận 3"
            />
          </>
        )}

        {tab === 'academic' && (
          <>
            <Text style={styles.note}>
              Ngành học: chọn từ danh sách 9 ngành của FPTU. Campus, khóa học và mã
              sinh viên là thông tin chỉ đọc từ tài khoản học vụ (roster).
            </Text>

            {/* Major — mobile CHO PHÉP SỬA (khác web, nơi có CTSV sync read-only) */}
            <View style={styles.field}>
              <Text style={styles.label}>
                Ngành học{canEdit('academic.major') ? '' : ' · Chỉ đọc'}
              </Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
                {MAJORS.map((m) => {
                  const selected = major === m;
                  const disabled = !canEdit('academic.major');
                  return (
                    <Pressable
                      key={m}
                      disabled={disabled}
                      onPress={() => setMajor(m)}
                      style={({ pressed }) => [
                        styles.chip,
                        selected && styles.chipSelected,
                        disabled && styles.chipDisabled,
                        pressed && !selected && { opacity: 0.7 },
                      ]}>
                      <Text
                        style={[
                          styles.chipText,
                          selected && styles.chipTextSelected,
                          disabled && styles.chipTextDisabled,
                        ]}>
                        {m}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
              {!canEdit('academic.major') ? (
                <View style={styles.readOnly}>
                  <Lock size={11} color="#9CA3AF" />
                </View>
              ) : null}
            </View>

            {/* Read-only: campus (từ user), cohort & studentCode (chưa có API
                nguồn ⇒ hiển thị "—" trung thực — mirror web "chỉ đọc từ học vụ").
                SelfProfileResponse không có các trường cohort/studentCode. */}
            <ReadOnlyRow label="Campus" value={campus || '—'} />
            <ReadOnlyRow label="Khóa học" value="—" />
            <ReadOnlyRow label="Mã sinh viên" value="—" />
            <View style={styles.readOnly}>
              <Lock size={11} color="#9CA3AF" />
              <Text style={styles.readOnlyText}>
                {' '}Chỉ đọc từ tài khoản học vụ — không thể chỉnh sửa trên mobile.
              </Text>
            </View>
          </>
        )}

        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}
      </ScrollView>

      {/* Footer: Hủy / Xem trước / Lưu */}
      <View style={styles.footer}>
        <PressableRow label="Hủy" onPress={onClose} disabled={saving} variant="outline" />
        <PressableRow label="Xem trước" onPress={preview} disabled={!changed || saving} variant="outline" icon={Eye} />
        <PressableRow
          label={saving ? 'Đang lưu…' : 'Lưu thay đổi'}
          onPress={save}
          disabled={!changed || saving}
          variant="primary"
          icon={saving ? undefined : Check}
        />
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type LabeledProps = {
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  editable?: boolean;
  maxLength?: number;
  multiline?: boolean;
  placeholder?: string;
  keyboardType?: 'numeric' | 'phone-pad' | 'default';
};

function Labeled({
  label,
  value,
  onChangeText,
  editable = true,
  maxLength,
  multiline,
  placeholder,
  keyboardType = 'default',
}: LabeledProps) {
  return (
    <View style={styles.field}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>{label}</Text>
        {!editable ? <Lock size={11} color="#9CA3AF" /> : null}
      </View>
      <TextInput
        style={[styles.input, multiline && styles.inputMultiline, !editable && styles.inputDisabled]}
        value={value}
        onChangeText={onChangeText}
        editable={editable}
        maxLength={maxLength}
        multiline={multiline}
        placeholder={placeholder}
        placeholderTextColor="#9CA3AF"
        keyboardType={keyboardType}
      />
    </View>
  );
}

function ReadOnlyRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.readOnlyRow}>
      <Text style={styles.readOnlyLabel}>{label}</Text>
      <Text style={styles.readOnlyValue}>{value}</Text>
    </View>
  );
}

type PressableRowProps = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  variant: 'outline' | 'primary';
  icon?: typeof Eye | typeof Check;
};

function PressableRow({ label, onPress, disabled = false, variant, icon: Icon }: PressableRowProps) {
  const isPrimary = variant === 'primary';
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.footerBtn,
        isPrimary ? styles.footerBtnPrimary : styles.footerBtnOutline,
        disabled && styles.footerBtnDisabled,
        pressed && !disabled && { opacity: 0.85 },
      ]}>
      <View style={styles.footerBtnContent}>
        {Icon ? <Icon size={14} color={isPrimary ? '#fff' : '#374151'} /> : null}
        {isPrimary && disabled ? <ActivityIndicator size="small" color="#fff" /> : null}
        <Text style={[styles.footerBtnText, isPrimary && styles.footerBtnTextPrimary]}>{label}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F9FAFB' },
  tabs: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 12,
    padding: 4,
    borderRadius: 14,
    backgroundColor: '#ECEEF5',
  },
  tab: { flex: 1, paddingVertical: 9, borderRadius: 11, alignItems: 'center' },
  tabActive: {
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 1,
  },
  tabText: { fontSize: 13, fontWeight: '700', color: '#6B7280' },
  tabTextActive: { color: '#C2410C' },

  content: { padding: 16, gap: 4, paddingBottom: 12 },
  note: {
    fontSize: 12,
    lineHeight: 18,
    color: '#6B7280',
    marginBottom: 8,
    backgroundColor: '#FFF7ED',
    padding: 10,
    borderRadius: 10,
    borderLeftWidth: 3,
    borderLeftColor: '#F97316',
  },

  field: { gap: 6, marginBottom: 10 },
  label: { fontSize: 12, fontWeight: '700', color: '#374151' },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  input: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    paddingHorizontal: 13,
    paddingVertical: 11,
    fontSize: 14,
    color: '#111827',
    backgroundColor: '#fff',
  },
  inputMultiline: { minHeight: 80, textAlignVertical: 'top' },
  inputDisabled: { backgroundColor: '#F9FAFB', color: '#6B7280' },
  readOnly: { flexDirection: 'row', alignItems: 'center', marginTop: 4, gap: 4 },
  readOnlyNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
    backgroundColor: '#F9FAFB',
    padding: 10,
    borderRadius: 10,
    borderLeftWidth: 3,
    borderLeftColor: '#E5E7EB',
  },
  readOnlyText: { fontSize: 11, color: '#9CA3AF' },
  readOnlyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  readOnlyLabel: { fontSize: 12.5, color: '#6B7280', fontWeight: '600' },
  readOnlyValue: { fontSize: 12.5, color: '#9CA3AF', fontWeight: '700' },

  chips: { gap: 8, paddingRight: 4 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#fff',
  },
  chipSelected: { backgroundColor: '#F97316', borderColor: '#F97316' },
  chipDisabled: { opacity: 0.5 },
  chipText: { fontSize: 11.5, fontWeight: '600', color: '#374151' },
  chipTextSelected: { color: '#fff', fontWeight: '800' },
  chipTextDisabled: { color: '#9CA3AF' },

  errorBox: {
    marginTop: 8,
    backgroundColor: '#FEF2F2',
    padding: 11,
    borderRadius: 10,
  },
  errorText: { fontSize: 12, lineHeight: 18, color: '#DC2626' },

  footer: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  footerBtn: {
    flex: 1,
    height: 46,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerBtnContent: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  footerBtnPrimary: { backgroundColor: '#F97316' },
  footerBtnOutline: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  footerBtnDisabled: { opacity: 0.5 },
  footerBtnText: { fontSize: 13, fontWeight: '700', color: '#374151' },
  footerBtnTextPrimary: { color: '#fff', fontWeight: '800' },
});
