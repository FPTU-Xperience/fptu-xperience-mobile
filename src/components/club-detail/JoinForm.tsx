// components/club-detail/JoinForm.tsx
//
// Form gửi hồ sơ gia nhập CLB (POST /api/clubs/{id}/join) — layout đồng bộ với
// form web (fptu-xperience-clubhub-ui ClubDetailPage).
//
// Prefill từ hồ sơ chuẩn (GET /api/users/me/profile — cùng nguồn web `useProfile`):
//   - Họ tên: profile.displayName (fallback user.name) — read-only
//   - Ngày sinh: personal.dateOfBirth — read-only (mobile không có date picker;
//     thiếu → hướng dẫn cập nhật Hồ sơ cá nhân, như web chặn submit)
//   - Email: user.email — read-only
//   - SĐT / Địa chỉ: personal.phoneNumber / address — cho sửa
//   - Sở thích / Kỹ năng: profile.interests / skills (join ', ') — read-only
// Người dùng điền: giới tính, lý do (*), kỳ vọng, đóng góp, lời nhắn + 2 consent.
//
// BE validate (ValidationExtensions.ValidateJoinRequest):
//   - fullName / email / reason bắt buộc
//   - phoneNumber (nếu có): `^\+?[0-9]{9,15}$`
//   - gender (nếu có): MALE | FEMALE | OTHER
//   - dateOfBirth (nếu có): trong 100 năm qua
//   - acceptedClubRules && committedToParticipate bắt buộc = true
//   - reason/message/hobbies/skills/expectations/contributions ≤ 1000 ký tự
// Client bắt buộc SĐT + ngày sinh (đúng chuẩn web: chặn submit nếu thiếu).

import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Check, X } from 'lucide-react-native';

import { getApiErrorMessage } from '@/services/apiClient';
import { joinClub } from '@/services/clubs';
import { fetchSelfProfile } from '@/services/profile';
import type { AuthUser } from '@/types/auth';

type Props = {
  visible: boolean;
  clubId: string;
  clubName: string;
  user: AuthUser | null;
  onClose: () => void;
  /** Gọi khi gửi hồ sơ thành công. */
  onSuccess?: () => void;
};

type Gender = '' | 'MALE' | 'FEMALE' | 'OTHER';

const GENDER_OPTIONS: { value: Gender; label: string }[] = [
  { value: 'MALE', label: 'Nam' },
  { value: 'FEMALE', label: 'Nữ' },
  { value: 'OTHER', label: 'Khác' },
];

type Errors = {
  phone?: string;
  dateOfBirth?: string;
  reason?: string;
  consents?: string;
};

const MAX_TEXT = 1000;

export default function JoinForm({
  visible,
  clubId,
  clubName,
  user,
  onClose,
  onSuccess,
}: Props) {
  // Trạng thái form (mặc định — sẽ bị ghi đè bởi hồ sơ chuẩn khi tải xong).
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [gender, setGender] = useState<Gender>('');
  const [reason, setReason] = useState('');
  const [expectations, setExpectations] = useState('');
  const [contributions, setContributions] = useState('');
  const [message, setMessage] = useState('');
  const [acceptedRules, setAcceptedRules] = useState(false);
  const [committed, setCommitted] = useState(false);

  // Dữ liệu prefill từ hồ sơ chuẩn (read-only cho UI).
  const [fullName, setFullName] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [interests, setInterests] = useState('');
  const [skills, setSkills] = useState('');
  // true = profile lần mở này đã tải xong (để indicator chạy). false khi form
  // vừa mở / bị đóng (reset) → indicator hiện tới khi fetch hoàn tất.
  const [profileResolved, setProfileResolved] = useState(false);

  const [errors, setErrors] = useState<Errors>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const reset = () => {
    setPhone('');
    setAddress('');
    setGender('');
    setReason('');
    setExpectations('');
    setContributions('');
    setMessage('');
    setAcceptedRules(false);
    setCommitted(false);
    setProfileResolved(false);
    setFullName(user?.name ?? '');
    setDateOfBirth('');
    setInterests('');
    setSkills('');
    setErrors({});
    setSubmitError(null);
    setSubmitting(false);
  };

  const close = () => {
    reset();
    onClose();
  };

  // Mỗi lần mở form: nạp hồ sơ chuẩn và prefill (đúng web: openJoin() gọi
  // setForm(joinProfile(viewer, profileResult.data)) mỗi lần mở).
  // Chỉ set state trong callback async của fetch — không set đồng bộ trong
  // thân effect (tránh cascading renders / lint set-state-in-effect).
  useEffect(() => {
    if (!visible) return;
    let active = true;
    fetchSelfProfile()
      .then((profile) => {
        if (!active) return;
        setFullName(profile?.profile.displayName || user?.name || '');
        setDateOfBirth(profile?.personal.dateOfBirth ?? '');
        if (profile?.personal.phoneNumber) setPhone(profile.personal.phoneNumber);
        if (profile?.personal.address) setAddress(profile.personal.address);
        setInterests((profile?.profile.interests ?? []).join(', '));
        setSkills((profile?.profile.skills ?? []).join(', '));
      })
      .finally(() => {
        if (active) setProfileResolved(true);
      });
    return () => {
      active = false;
    };
    // `user` cố định trong phiên (AuthUser từ AuthProvider) — chỉ trigger khi
    // form mở/đóng.
  }, [visible, user]);

  // Indicator "đang tải hồ sơ": form đang mở, chưa reset (mới mở), và fetch
  // của lần mở này chưa hoàn tất.
  const profileLoading = visible && !profileResolved;

  /** Validate cục bộ trước khi gọi API. */
  const validate = (): boolean => {
    const next: Errors = {};

    if (!dateOfBirth.trim()) {
      next.dateOfBirth = 'Chưa có ngày sinh. Vui lòng cập nhật trong Hồ sơ cá nhân trước khi gửi.';
    }

    const normalizedPhone = phone.trim().replace(/[^0-9+]/g, '');
    const digits = normalizedPhone.replace(/\D/g, '');
    if (!digits) next.phone = 'Vui lòng nhập số điện thoại.';
    else if (!/^\+?[0-9]{9,15}$/.test(normalizedPhone)) {
      next.phone = 'Số điện thoại chỉ được gồm dấu + và 9-15 chữ số.';
    }

    if (!reason.trim()) next.reason = 'Vui lòng nêu lý do muốn gia nhập.';
    else if (reason.trim().length > MAX_TEXT) next.reason = `Lý do tối đa ${MAX_TEXT} ký tự.`;

    if (!acceptedRules || !committed) {
      next.consents = 'Bạn cần đồng ý với cả hai cam kết để gửi hồ sơ.';
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const submit = async () => {
    if (submitting) return;
    if (!validate()) return;

    setSubmitting(true);
    setSubmitError(null);

    const optional = (v: string) => v.trim() || null;

    try {
      const result = await joinClub(clubId, {
        fullName: (fullName || user?.name || '').trim(),
        email: user?.email ?? '',
        // Gửi giá trị đã normalize (loại khoảng trắng/dấu gạch) để khớp regex
        // phía BE `^\+?[0-9]{9,15}$` — cùng chuẩn với validate() ở trên.
        phoneNumber: phone.trim().replace(/[^0-9+]/g, ''),
        // "yyyy-MM-dd" (null nếu thiếu — BE accept; client đã chặn trước đó).
        dateOfBirth: dateOfBirth.trim() ? dateOfBirth : null,
        gender,
        address: optional(address),
        // Ảnh web map interests → hobbies (join ', ') — giữ đúng.
        hobbies: optional(interests),
        skills: optional(skills),
        reason: reason.trim(),
        expectations: optional(expectations),
        contributions: optional(contributions),
        additionalInfo: null,
        message: optional(message),
        acceptedClubRules: acceptedRules,
        committedToParticipate: committed,
      });

      if (result.success) {
        reset();
        onSuccess?.();
        onClose();
      } else {
        setSubmitError(result.message);
      }
    } catch (err) {
      setSubmitError(getApiErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const readOnlyNote = (
    <Text style={styles.helperNote}>Lấy từ hồ sơ của bạn</Text>
  );

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={close}>
      <View style={styles.backdrop}>
        <Pressable style={styles.backdropTap} onPress={close} />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.sheetWrap}>
          <View style={styles.sheet}>
            <View style={styles.header}>
              <View style={styles.headerText}>
                <Text style={styles.title}>Gia nhập {clubName}</Text>
                <Text style={styles.subtitle}>
                  Điền thông tin để gửi hồ sơ tới ban chủ nhiệm CLB.
                </Text>
              </View>
              <Pressable style={styles.close} onPress={close} hitSlop={8}>
                <X size={18} color="#6B7280" />
              </Pressable>
            </View>

            <ScrollView
              style={styles.body}
              contentContainerStyle={styles.bodyContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}>
              {profileLoading ? (
                <View style={styles.profileLoading}>
                  <ActivityIndicator color="#F97316" size="small" />
                  <Text style={styles.profileLoadingText}>Đang tải thông tin hồ sơ…</Text>
                </View>
              ) : null}

              {/* Họ và tên — prefill hồ sơ, read-only */}
              <View style={styles.labelRow}>
                <Text style={styles.label}>Họ và tên *</Text>
                {readOnlyNote}
              </View>
              <TextInput
                style={[styles.input, styles.inputDisabled]}
                value={fullName}
                editable={false}
                placeholder="Chưa đăng nhập"
                placeholderTextColor="#9CA3AF"
              />

              {/* Ngày sinh — từ hồ sơ, read-only */}
              <View style={styles.labelRow}>
                <Text style={styles.label}>
                  Ngày sinh * <Text style={styles.optionalNote}>(Bắt buộc)</Text>
                </Text>
                {readOnlyNote}
              </View>
              <TextInput
                style={[
                  styles.input,
                  styles.inputDisabled,
                  errors.dateOfBirth && styles.inputError,
                ]}
                value={dateOfBirth ? formatDateOfBirth(dateOfBirth) : ''}
                editable={false}
                placeholder="Cập nhật trong Hồ sơ cá nhân"
                placeholderTextColor="#9CA3AF"
              />
              {errors.dateOfBirth ? (
                <Text style={styles.error}>{errors.dateOfBirth}</Text>
              ) : null}

              {/* Email & SĐT */}
              <View style={styles.labelRow}>
                <Text style={styles.label}>Email *</Text>
                {readOnlyNote}
              </View>
              <TextInput
                style={[styles.input, styles.inputDisabled]}
                value={user?.email ?? ''}
                editable={false}
                placeholder="Chưa đăng nhập"
                placeholderTextColor="#9CA3AF"
                autoCapitalize="none"
                keyboardType="email-address"
              />

              <View style={styles.labelRow}>
                <Text style={styles.label}>Số điện thoại *</Text>
              </View>
              <TextInput
                style={[styles.input, errors.phone && styles.inputError]}
                value={phone}
                onChangeText={(t) => {
                  setPhone(t);
                  if (errors.phone) setErrors((e) => ({ ...e, phone: undefined }));
                }}
                placeholder="VD: 0912345678"
                placeholderTextColor="#9CA3AF"
                keyboardType="phone-pad"
              />
              {errors.phone ? <Text style={styles.error}>{errors.phone}</Text> : null}

              {/* Địa chỉ (không bắt buộc) */}
              <View style={styles.labelRow}>
                <Text style={styles.label}>
                  Địa chỉ <Text style={styles.optionalNote}>(Không bắt buộc)</Text>
                </Text>
              </View>
              <TextInput
                style={styles.input}
                value={address}
                onChangeText={setAddress}
                placeholder="Địa chỉ thường trú / chỗ ở hiện tại"
                placeholderTextColor="#9CA3AF"
              />

              {/* Giới tính (không bắt buộc — BE: MALE | FEMALE | OTHER) */}
              <View style={styles.labelRow}>
                <Text style={styles.label}>
                  Giới tính <Text style={styles.optionalNote}>(Không bắt buộc)</Text>
                </Text>
              </View>
              <View style={styles.genderRow}>
                {GENDER_OPTIONS.map((opt) => {
                  const selected = gender === opt.value;
                  return (
                    <Pressable
                      key={opt.value}
                      style={[styles.genderChip, selected && styles.genderChipOn]}
                      onPress={() => setGender(selected ? '' : opt.value)}>
                      <Text style={[styles.genderChipText, selected && styles.genderChipTextOn]}>
                        {opt.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              {/* Lý do (bắt buộc) */}
              <Text style={styles.label}>Lý do muốn gia nhập CLB *</Text>
              <TextInput
                style={[styles.input, styles.textarea, errors.reason && styles.inputError]}
                value={reason}
                onChangeText={(t) => {
                  setReason(t);
                  if (errors.reason) setErrors((e) => ({ ...e, reason: undefined }));
                }}
                placeholder="Chia sẻ mục tiêu, mong muốn và những gì bạn muốn đóng góp..."
                placeholderTextColor="#9CA3AF"
                multiline
                numberOfLines={4}
                maxLength={MAX_TEXT}
              />
              {errors.reason ? <Text style={styles.error}>{errors.reason}</Text> : null}

              {/* Sở thích — từ hồ sơ (join ', '), BE lưu vào `hobbies` */}
              <View style={styles.labelRow}>
                <Text style={styles.label}>Sở thích của bạn</Text>
                {readOnlyNote}
              </View>
              <TextInput
                style={[styles.input, styles.inputDisabled]}
                value={interests}
                editable={false}
                placeholder="Chưa có trong hồ sơ"
                placeholderTextColor="#9CA3AF"
              />

              {/* Kỹ năng — từ hồ sơ */}
              <View style={styles.labelRow}>
                <Text style={styles.label}>Kỹ năng nổi bật</Text>
                {readOnlyNote}
              </View>
              <TextInput
                style={[styles.input, styles.inputDisabled]}
                value={skills}
                editable={false}
                placeholder="Chưa có trong hồ sơ"
                placeholderTextColor="#9CA3AF"
              />

              {/* Kỳ vọng / Đóng góp / Lời nhắn — không bắt buộc */}
              <View style={styles.labelRow}>
                <Text style={styles.label}>Kỳ vọng của bạn</Text>
                <Text style={styles.optionalNote}>(Không bắt buộc)</Text>
              </View>
              <TextInput
                style={[styles.input, styles.textarea]}
                value={expectations}
                onChangeText={setExpectations}
                placeholder="Bạn kỳ vọng gì khi tham gia CLB?"
                placeholderTextColor="#9CA3AF"
                multiline
                numberOfLines={3}
                maxLength={MAX_TEXT}
              />

              <View style={styles.labelRow}>
                <Text style={styles.label}>Mô tả các hoạt động bạn có thể đóng góp</Text>
                <Text style={styles.optionalNote}>(Không bắt buộc)</Text>
              </View>
              <TextInput
                style={[styles.input, styles.textarea]}
                value={contributions}
                onChangeText={setContributions}
                placeholder="VD: tổ chức sự kiện, kỹ thuật, truyền thông..."
                placeholderTextColor="#9CA3AF"
                multiline
                numberOfLines={3}
                maxLength={MAX_TEXT}
              />

              <View style={styles.labelRow}>
                <Text style={styles.label}>Lời nhắn muốn gửi CLB</Text>
                <Text style={styles.optionalNote}>(Không bắt buộc)</Text>
              </View>
              <TextInput
                style={[styles.input, styles.textarea]}
                value={message}
                onChangeText={setMessage}
                placeholder="Ghi chú hoặc lời nhắn riêng cho CLB (không bắt buộc)"
                placeholderTextColor="#9CA3AF"
                multiline
                numberOfLines={3}
                maxLength={MAX_TEXT}
              />

              {/* Consent — đồng bộ chữ với web */}
              <CheckOption
                checked={acceptedRules}
                onToggle={() => {
                  setAcceptedRules((v) => !v);
                  if (errors.consents) setErrors((e) => ({ ...e, consents: undefined }));
                }}
                label="Tôi đã đọc và đồng ý với Quy định câu lạc bộ."
              />
              <CheckOption
                checked={committed}
                onToggle={() => {
                  setCommitted((v) => !v);
                  if (errors.consents) setErrors((e) => ({ ...e, consents: undefined }));
                }}
                label="Tôi cam kết tham gia nghiêm túc khi hồ sơ được duyệt."
              />
              {errors.consents ? <Text style={styles.error}>{errors.consents}</Text> : null}

              {submitError ? <Text style={styles.submitError}>{submitError}</Text> : null}
            </ScrollView>

            <View style={styles.footer}>
              <Pressable style={styles.cancel} onPress={close} disabled={submitting}>
                <Text style={styles.cancelText}>Hủy bỏ</Text>
              </Pressable>
              <Pressable
                style={[styles.submit, submitting && styles.submitOff]}
                onPress={submit}
                disabled={submitting}>
                {submitting ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.submitText}>Gửi hồ sơ gia nhập</Text>
                )}
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

/** "yyyy-MM-dd" → "dd/mm/yyyy" (ẩn khi invalid). */
function formatDateOfBirth(iso: string): string {
  const [y, m, d] = iso.split('-');
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

function CheckOption({
  checked,
  onToggle,
  label,
}: {
  checked: boolean;
  onToggle: () => void;
  label: string;
}) {
  return (
    <Pressable style={styles.checkRow} onPress={onToggle}>
      <View style={[styles.checkbox, checked && styles.checkboxOn]}>
        {checked ? <Check size={13} color="#fff" strokeWidth={3} /> : null}
      </View>
      <Text style={styles.checkLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(17,24,39,0.45)', justifyContent: 'flex-end' },
  backdropTap: { flex: 1 },
  sheetWrap: { maxHeight: '88%' },
  sheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 20,
  },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  headerText: { flex: 1 },
  title: { fontSize: 17, fontWeight: '800', color: '#111827' },
  subtitle: { fontSize: 12.5, lineHeight: 18, color: '#6B7280', marginTop: 3 },
  close: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { marginTop: 14 },
  bodyContent: { paddingBottom: 8 },

  profileLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
    padding: 10,
    borderRadius: 12,
    backgroundColor: '#FFF7ED',
  },
  profileLoadingText: { fontSize: 12, color: '#9A3412' },

  labelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  label: { flex: 1, fontSize: 12, fontWeight: '700', color: '#374151', marginBottom: 6, marginTop: 12 },
  helperNote: { fontSize: 11, color: '#9CA3AF', marginBottom: 6, marginTop: 1 },
  optionalNote: { color: '#9CA3AF', fontWeight: '400' },

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
  inputDisabled: { backgroundColor: '#F9FAFB', color: '#6B7280' },
  inputError: { borderColor: '#EF4444' },
  textarea: { minHeight: 72, textAlignVertical: 'top' },

  genderRow: { flexDirection: 'row', gap: 8 },
  genderChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#fff',
  },
  genderChipOn: { borderColor: '#F97316', backgroundColor: '#FFF7ED' },
  genderChipText: { fontSize: 13, fontWeight: '600', color: '#374151' },
  genderChipTextOn: { color: '#C2410C' },

  error: { fontSize: 11.5, color: '#DC2626', marginTop: 5 },
  submitError: {
    fontSize: 12.5,
    lineHeight: 18,
    color: '#DC2626',
    marginTop: 14,
    backgroundColor: '#FEF2F2',
    padding: 11,
    borderRadius: 12,
  },

  checkRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginTop: 14 },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: '#D1D5DB',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  checkboxOn: { backgroundColor: '#F97316', borderColor: '#F97316' },
  checkLabel: { flex: 1, fontSize: 12.5, lineHeight: 18, color: '#374151' },

  footer: { flexDirection: 'row', gap: 10, marginTop: 16 },
  cancel: {
    flex: 1,
    height: 50,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelText: { fontSize: 14, fontWeight: '700', color: '#374151' },
  submit: {
    flex: 1,
    height: 50,
    borderRadius: 14,
    backgroundColor: '#F97316',
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitOff: { opacity: 0.6 },
  submitText: { color: '#fff', fontSize: 15, fontWeight: '800' },
});
