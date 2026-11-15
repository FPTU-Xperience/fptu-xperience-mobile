// services/profile.ts
//
// Nguồn dữ liệu thật cho màn Hồ sơ (profile).
//
// - Người dùng:   GET /api/users/me                        → UserSummary
// - Hồ sơ chuẩn:  GET /api/users/me/profile                 → SelfProfileResponse
// - Trải nghiệm:   GET /api/users/me/experience-summary     → ExperienceSummary
// - Radar 6 trục:  GET /api/v1/declarations/me/radar        → StudentRadar
// - CLB:          GET /api/clubs/me/memberships             → filter APPROVED
//
// Quy tắc Phase 1: mọi nguồn TRỪ `/api/users/me` đều được `.catch` riêng —
// một nguồn lỗi không làm hỏng cả màn (radar/summary/clb/hồ sơ chuẩn),
// để phần thông tin cơ bản vẫn hiển thị.

import { randomUUID } from 'expo-crypto';

import { apiFetch, toQuery } from '@/services/apiClient';
import { initialsOf } from '@/services/uiDerive';
import { isVersionConflict } from '@/services/profile-media';
import type {
  ClubMembershipResponse,
  Contribution,
  ExperienceSummary,
  LegacyContributionItem,
  PillarRadarItem,
  SelfProfileResponse,
  StudentContributionPage,
  StudentRadar,
  UserSummary,
} from '@/types/api';
import type {
  Competency,
  Evidence,
  ProfileClub,
  ProfileFeed,
  ProfileStat,
  ProfileUser,
} from '@/types/profile';

/**
 * 9 ngành cho phép — mirror backend `StudentOnboardingRules.Majors`
 * (AuthService/Endpoints/StudentOnboardingRules.cs, `StringComparer.Ordinal`).
 * Backend KHÔNG có endpoint nào lộ danh sách ⇒ dùng hằng tĩnh. Nếu backend đổi
 * danh sách, mobile phải đồng bộ thủ công (rủi ro đã ghi trong plan).
 */
export const MAJORS: readonly string[] = [
  'Kỹ thuật phần mềm',
  'Trí tuệ nhân tạo',
  'An toàn thông tin',
  'Thiết kế mỹ thuật số',
  'Truyền thông đa phương tiện',
  'Kinh doanh quốc tế',
  'Digital Marketing',
  'Ngôn ngữ Anh',
  'Ngôn ngữ Nhật',
];

/** Một field trong `editableFields` (vd "profile.displayName", "academic.major"). */
function isEditable(editableFields: string[] | null, path: string): boolean {
  return editableFields === null || editableFields.includes(path);
}

/** Nhãn tiếng Việt cho 6 trục radar (CoreSix). */
const PILLAR_LABEL: Record<string, string> = {
  Academic: '1. Học tập',
  Research: '2. Nghiên cứu',
  Global: '3. Quốc tế',
  CultureSports: '4. Thể thao & VH',
  Community: '5. Cộng đồng',
  Entrepreneurship: '6. Khởi nghiệp',
};

/** Nhãn tiếng Việt cho trục "+1" (RealWorldWork). */
const PLUS_ONE_LABEL = '7. Thực chiến';

const UNKNOWN = '--';

/**
 * GET /api/users/me/profile — hồ sơ chuẩn (displayName, about, skills, interests,
 * headline, major, editableFields, version).
 *
 * Đứng riêng để `fetchProfile` có thể `.catch` nguồn này: lỗi hồ sơ chuẩn
 * không làm mất tên/điểm/radar của user (vẫn lấy từ `/api/users/me`).
 */
export async function fetchSelfProfile(): Promise<SelfProfileResponse | null> {
  try {
    return await apiFetch<SelfProfileResponse>('/api/users/me/profile');
  } catch {
    return null;
  }
}

/**
 * GET /api/clubs/me/memberships → lọc APPROVED → danh sách CLB user đang sinh hoạt.
 * Pattern reuse từ `myClubs.ts:classify` (lowercase/trim → 'approved').
 */
export async function fetchApprovedClubs(): Promise<ProfileClub[]> {
  try {
    const memberships = await apiFetch<ClubMembershipResponse[]>('/api/clubs/me/memberships');
    const isApproved = (status: string) =>
      (status ?? '').trim().toLowerCase() === 'approved';

    return (memberships ?? [])
      .filter((m) => isApproved(m.status))
      .map((m) => ({
        id: String(m.clubId),
        name: m.clubName,
        field: m.clubCategory || 'CLB',
        badge: (m.role || 'MEMBER').toUpperCase(),
      }));
  } catch {
    // Không có quyền / chưa có membership → danh sách rỗng, UI hiện empty state.
    return [];
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/users/me/profile (Phase 4 — chỉnh sửa hồ sơ)
//
// Wire (backend CanonicalProfileEndpoints.PatchAsync):
//   { expectedVersion (GUID), profile?, personal?, academic?, onboarding? }
//   — mỗi section chỉ chứa field BỊĐỔI (backend bỏ qua section rỗng).
//   — bắt buộc header `Idempotency-Key` (thiếu → 400 IDEMPOTENCY_KEY_REQUIRED).
//   — 409 STALE_PROFILE khi version lệch → refetch + retry 1 lần (đúng web).
//
// `editableFields` gate phía client (mirror web use-server-profile-images.js):
//   server vẫn enforce whitelist, nhưng chặn sớm ở UI để user thấy nhãn
//   "Chỉ đọc" thay vì lỗi.
// ---------------------------------------------------------------------------

/** Field chỉnh sửa (bằng draft đã validate ở UI) — chỉ section bị đổi. */
export interface SelfProfilePatch {
  profile?: {
    displayName?: string;
    about?: string;
    skills?: string[];
    interests?: string[];
    headline?: string | null;
  };
  personal?: {
    dateOfBirth?: string | null;
    phoneNumber?: string | null;
    address?: string | null;
  };
  academic?: {
    major?: string;
  };
}

export interface PatchSelfProfileInput {
  /** Draft từ form (chỉ section bị đổi). */
  patch: SelfProfilePatch;
  /** `version` hiện tại (GUID string). null → refetch trước. */
  version: string | null;
  /** `editableFields` hiện tại; null → không gate client (server enforce). */
  editableFields: string[] | null;
}

/**
 * PATCH /api/users/me/profile. Trả SelfProfileResponse MỚI (version mới)
 * để UI cập nhật state — KHÔNG tự refetch feed (màn gọi retry riêng).
 */
export async function patchSelfProfile(
  input: PatchSelfProfileInput,
): Promise<SelfProfileResponse> {
  const { patch, version, editableFields } = input;

  // Gate client: field nào ngoài editableFields thì chặn ngay.
  // (Server trả 403 PROFILE_FIELD_FORBIDDEN nếu bỏ qua bước này.)
  const sections: [string, Record<string, unknown> | undefined][] = [
    ['profile', patch.profile],
    ['personal', patch.personal],
    ['academic', patch.academic],
  ];
  for (const [section, data] of sections) {
    if (data === undefined) continue;
    for (const field of Object.keys(data)) {
      if (!isEditable(editableFields, `${section}.${field}`)) {
        throw new Error(`Máy chủ không cho phép sửa "${field}". Hãy tải lại hồ sơ rồi thử lại.`);
      }
    }
  }

  const doPatch = (v: string) =>
    apiFetch<SelfProfileResponse>('/api/users/me/profile', {
      method: 'PATCH',
      body: {
        expectedVersion: v,
        ...(patch.profile ? { profile: patch.profile } : {}),
        ...(patch.personal ? { personal: patch.personal } : {}),
        ...(patch.academic ? { academic: patch.academic } : {}),
      },
      headers: { 'Idempotency-Key': randomUUID() },
    });

  let v = version;
  if (!v) {
    const fresh = await fetchSelfProfile();
    if (!fresh) throw new Error('Không tải được hồ sơ để lưu thay đổi. Vui lòng thử lại.');
    v = fresh.version;
  }

  try {
    return await doPatch(v);
  } catch (err) {
    if (!isVersionConflict(err)) throw err;
    // Hồ sơ bị ai đó sửa (vd web) trong lúc điền form → lấy version mới, retry MỘT lần.
    const fresh = await fetchSelfProfile();
    if (!fresh) throw err;
    return doPatch(fresh.version);
  }
}

/** Format số thập phân 1 chữ số (ERI). */
function formatDecimal(value: number): string {
  if (!Number.isFinite(value)) return '0.0';
  return value.toFixed(1);
}

/**
 * Tính độ sâu / độ đều / hệ số từ 6 trục radar.
 *
 * - depth: trung bình điểm bão hòa (0-100)
 * - evenness: độ đều giữa các trục (0-1) — dùng hệ số biến thiên
 * - factor: hệ số nhân tổng hợp (0-1.2)
 */
function deriveCompetency(radar: StudentRadar | null): Competency {
  const axes = (radar?.radarAxes ?? []).map((p: PillarRadarItem) => ({
    label: PILLAR_LABEL[p.pillar] ?? p.pillar,
    value: Math.round(p.saturatedScore),
  }));

  const values = axes.map((a) => a.value);

  if (values.length === 0) {
    return {
      quote: 'Hành trình của bạn không chỉ được đo bằng điểm số',
      axes: [],
      depth: 0,
      evenness: 0,
      factor: 0,
      note: 'Chỉ số ERI được tính toán tự động dựa trên độ sâu, độ đều và tính xác thực của các minh chứng hoạt động đã tham gia.',
    };
  }

  const depth = values.reduce((sum, v) => sum + v, 0) / values.length;

  const mean = depth;
  const variance =
    values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
  const stdDev = Math.sqrt(variance);
  // Độ đều = 1 khi tất cả trục bằng nhau, giảm dần khi phân tán rộng.
  const evenness = mean > 0 ? Math.max(0, Math.min(1, 1 - stdDev / mean)) : 0;

  // Hệ số: cân bằng giữa độ sâu và độ đều.
  const factor = (depth / 100) * (0.6 + 0.4 * evenness);

  const plusOne = radar?.plusOne;
  const allAxes = plusOne
    ? [...axes, { label: PLUS_ONE_LABEL, value: Math.round(plusOne.saturatedScore) }]
    : axes;

  return {
    quote: 'Hành trình của bạn không chỉ được đo bằng điểm số',
    axes: allAxes,
    depth: Math.round(depth),
    evenness: Number(evenness.toFixed(2)),
    factor: Number(factor.toFixed(2)),
    note: 'Chỉ số ERI được tính toán tự động dựa trên độ sâu, độ đều và tính xác thực của các minh chứng hoạt động đã tham gia.',
  };
}

// ---------------------------------------------------------------------------
// GET /api/users/me/contributions (Phase 5 — tab Minh chứng thật)
//
// Endpoint (AdminService / VerifiedContributionEndpoints.ListSelfAsync):
//   ?semesterId&status&pillar&page&pageSize  (pageSize mặc định 20, clamp 1–100)
//   → StudentContributionPage { items, page, pageSize, total, totalItems, totalPages }
// `items` là UNION của 2 record (backend UNION canonical + legacy kê khai cũ):
//   - ContributionResponse        (sourceNamespace "CONTRIBUTION", có rawPoints)
//   - LegacyContributionItem      (sourceNamespace "LEGACY_DECLARATION",
//                                  rawPoints ở `legacyRawPointsPreview`, nullable)
// Sắp giảm theo CreatedAtUtc. Sờ lại: 400 INVALID_PAGINATION / INVALID_STATUS /
// INVALID_PILLAR / INVALID_SEMESTER khi param ngoài bảng.
// ---------------------------------------------------------------------------

export interface FetchContributionsParams {
  page?: number;
  pageSize?: number;
  /** SUBMITTED | APPROVED | REJECTED | REVISION_REQUESTED | REVOKED (null = tất cả). */
  status?: string | null;
  /** Trụ cột (vd "Academic"). null = tất cả. */
  pillar?: string | null;
  /** Học kỳ (GUID hoặc mã, vd "2025-HK1"). null = tất cả. */
  semesterId?: string | null;
}

export interface ContributionsPage {
  items: Evidence[];
  page: number;
  totalPages: number;
  totalItems: number;
  /** `page < totalPages` — UI dùng để hiện/ẩn nút "Xem thêm". */
  hasMore: boolean;
}

/** Nhãn tiếng Việt cho trạng thái contribution (mirror web EXPERIENCE_STATES). */
export const CONTRIBUTION_STATUS_LABEL: Record<string, string> = {
  SUBMITTED: 'Chờ xét duyệt',
  APPROVED: 'Đã ghi nhận',
  REJECTED: 'Không thông qua',
  REVISION_REQUESTED: 'Cần bổ sung minh chứng',
  REVOKED: 'Đã thu hồi',
};

/** Nhãn nguồn minh chứng (SourceType backend → tiếng Việt). */
const CONTRIBUTION_SOURCE_LABEL: Record<string, string> = {
  CLUB: 'Câu lạc bộ',
  EXTERNAL: 'Ngoại CLB',
  CLOSING_DUTY: 'Trực kết thúc sự kiện',
};

/** ISO → DD/MM/YYYY (giờ local) — mirror cách `uiDerive.formatTimes` dùng `new Date`. */
function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
}

/**
 * Map union Contribution (canonical + legacy) → Evidence UI.
 * `rawPoints` chỉ có nghĩa khi APPROVED (backend `recognitionStatus`); giữ nguyên
 * giá trị, UI quyết định chỉ hiện điểm khi status = APPROVED.
 */
function mapContributionToEvidence(
  item: Contribution | LegacyContributionItem,
): Evidence {
  const status = (item.status ?? '').trim().toUpperCase();
  const isLegacy = 'legacyRawPointsPreview' in item;
  const rawPoints: number | null = isLegacy
    ? item.legacyRawPointsPreview
    : item.rawPoints;
  const source = item.sourceType || 'MINH_CHUNG';

  const evidence: Evidence = {
    id: item.id,
    title: item.title,
    issuer: CONTRIBUTION_SOURCE_LABEL[source] ?? source,
    date: formatDate(item.occurredAt),
    status,
    rawPoints: typeof rawPoints === 'number' && Number.isFinite(rawPoints) ? rawPoints : null,
  };
  // Chỉ record canonical có `clubId` (legacy không có trường này).
  if (!isLegacy) evidence.clubId = item.clubId ?? null;
  return evidence;
}

/**
 * GET /api/users/me/contributions (phân trang). Lỗi → throw (UI tab tự hiện
 * ErrorState + retry + load-more) — không `.catch` nuốt như các nguồn feed.
 */
export async function fetchContributions(
  params: FetchContributionsParams = {},
): Promise<ContributionsPage> {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 20));

  const data = await apiFetch<StudentContributionPage>(
    `/api/users/me/contributions${toQuery({
      status: params.status,
      pillar: params.pillar,
      semesterId: params.semesterId,
      page,
      pageSize,
    })}`,
  );

  const items = (data?.items ?? []).map(mapContributionToEvidence);
  const totalPages = Math.max(1, data?.totalPages ?? 1);

  return {
    items,
    page,
    totalPages,
    totalItems: data?.totalItems ?? items.length,
    hasMore: page < totalPages,
  };
}

/**
 * GET /api/users/me + /api/users/me/profile + /api/users/me/experience-summary
 * + /api/v1/declarations/me/radar + /api/clubs/me/memberships (approved)
 *
 * Chỉ `/api/users/me` là nguồn bắt buộc (lỗi → cả feed lỗi). Các nguồn còn lại
 * tự `.catch` về null/[] để hồ sơ vẫn hiện được phần thông tin cơ bản thay vì
 * trắng toàn bộ khi radar/summary/clb/hồ sơ chuẩn chưa có dữ liệu.
 */
export async function fetchProfile(campus = ''): Promise<ProfileFeed> {
  const [me, selfProfile, summary, radar, clubs] = await Promise.all([
    apiFetch<UserSummary>('/api/users/me'),
    fetchSelfProfile(),
    apiFetch<ExperienceSummary>('/api/users/me/experience-summary').catch(() => null),
    apiFetch<StudentRadar>('/api/v1/declarations/me/radar').catch(() => null),
    fetchApprovedClubs(),
  ]);

  const displayName = selfProfile?.profile.displayName || me.fullName || me.username;
  const user: ProfileUser = {
    name: displayName,
    initials: initialsOf(displayName),
    statusLabel: radar?.profileTitle ?? UNKNOWN,
    major: selfProfile?.academic.major ?? UNKNOWN,
    cohort: radar?.semesterCode ?? UNKNOWN,
    campusCode: me.campusCode ?? 'HAN',
    university: 'FPTU Hà Nội',
    campusName: 'Campus Hòa Lạc',
    bio: selfProfile?.profile.about ?? '',
    coverImageUrl: selfProfile?.profile.coverImageUrl ?? null,
    avatarUrl: selfProfile?.profile.avatarUrl ?? null,
    coverText: 'Make your time\nmean something.',
  };

  const stats: ProfileStat[] = [
    {
      id: 'eri',
      label: 'Chỉ số ERI',
      value: formatDecimal(radar?.eri ?? 0),
      hint: `Xếp hạng Hola: ${radar?.profileTitle ?? UNKNOWN}`,
      iconKind: 'zap',
    },
    {
      id: 'xp',
      label: 'Xperience Point',
      value: String(summary?.rawExperiencePoints ?? 0),
      hint: 'Điểm tích lũy trọn',
      iconKind: 'star',
    },
    {
      id: 'attendance',
      label: 'Lượt điểm danh',
      value: String(summary?.verifiedAttendanceCount ?? 0),
      hint: 'Qua quét mã QR',
      iconKind: 'check',
    },
    {
      id: 'clubs',
      label: 'CLB tham gia',
      // Cùng nguồn với menu m1 (danh sách membership approved) → nhất quán.
      value: String(clubs.length),
      hint: 'Đang sinh hoạt',
      iconKind: 'users',
    },
  ];

  // skills thật từ hồ sơ chuẩn (fallback interests — 2 nguồn cùng từ profile).
  const skills =
    selfProfile?.profile.skills?.length
      ? selfProfile.profile.skills
      : (selfProfile?.profile.interests ?? []);

  // Số CLB trong menu theo danh sách membership thật (không phải summary).
  const clubsCount = clubs.length;

  return {
    campus: campus || 'FPTU HÀ NỘI - HOLA',
    user,
    stats,
    competency: deriveCompetency(radar),
    skills,
    clubs,
    menu: [
      { id: 'm1', label: 'Câu lạc bộ của tôi', count: clubsCount, iconKind: 'flag' },
      { id: 'm2', label: 'Lịch học & Sự kiện đã lưu', iconKind: 'calendar' },
      { id: 'm3', label: 'Trải nghiệm cá nhân & Minh chứng', iconKind: 'trophy' },
      { id: 'm4', label: 'Kho quà CLB', iconKind: 'gift' },
    ],
    selfProfile,
  };
}
