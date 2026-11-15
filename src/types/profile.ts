// types/profile.ts
export type ProfileTabKey = 'overview' | 'evidence';
export type StatIconKind = 'zap' | 'star' | 'check' | 'users';
export type MenuIconKind = 'flag' | 'calendar' | 'trophy' | 'gift';

export interface ProfileUser {
  name: string;
  initials: string;
  statusLabel: string;
  major: string;
  cohort: string;
  campusCode: string;
  university: string;
  campusName: string;
  bio: string;
  coverText: string;
  /** Ảnh bìa thật (null khi chưa có) — Phase 2 render bằng expo-image. */
  coverImageUrl?: string | null;
  /** Ảnh cá nhân thật (null khi chưa có) — Phase 2 render bằng expo-image. */
  avatarUrl?: string | null;
}

export interface ProfileStat {
  id: string;
  label: string;
  value: string;
  hint: string;
  iconKind: StatIconKind;
}

export interface CompetencyAxis {
  label: string;
  /** 0 - 100 */
  value: number;
}

export interface Competency {
  quote: string;
  axes: CompetencyAxis[];
  depth: number;
  evenness: number;
  factor: number;
  note: string;
}

export interface ProfileClub {
  id: string;
  name: string;
  field: string;
  badge: string;
}

export interface ProfileMenuItem {
  id: string;
  label: string;
  count?: number;
  iconKind: MenuIconKind;
}

export interface Evidence {
  id: string;
  title: string;
  issuer: string;
  date: string;
  /**
   * Phase 5 — trạng thái xét duyệt (contribution):
   * SUBMITTED | APPROVED | REJECTED | REVISION_REQUESTED | REVOKED.
   * undefined khi chưa có (data cũ / mock).
   */
  status?: string;
  /** Phase 5 — điểm nhận (chỉ có nghĩa khi APPROVED; null khi chưa xét / không ghi nhận). */
  rawPoints?: number | null;
  /** Phase 5 — ID CLB nộp (contribution qua CLB; null nếu không phải nguồn CLB). */
  clubId?: number | null;
}

export interface ProfileFeed {
  campus: string;
  user: ProfileUser;
  stats: ProfileStat[];
  competency: Competency;
  skills: string[];
  clubs: ProfileClub[];
  menu: ProfileMenuItem[];
  /**
   * Hồ sơ chuẩn gốc (GET /api/users/me/profile) — null khi source này lỗi.
   * Phase 3/4 dùng `version` (CAS khi PATCH) + `editableFields` (gate chỉnh sửa).
   */
  selfProfile?: import('@/types/api').SelfProfileResponse | null;
}