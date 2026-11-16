// services/clubs.ts
//
// Nguồn dữ liệu thật cho câu lạc bộ (clubs) qua FPTU ClubHub API Gateway.
//
// - Danh sách: GET /api/clubs?search=&category=&campus=&active=&recruiting=
// - Chi tiết:  GET /api/clubs/{id}
// - Danh mục:  GET /api/clubs/categories
// - Gia nhập:  POST /api/clubs/{id}/join
// - Sự kiện của CLB: GET /api/v2/activities/feed?clubId=
//
// Service trả về ĐÚNG kiểu UI trong `types/club.ts` + `types/clubDetail.ts`.
// Field API không trả (màu banner, icon, quote…) sinh deterministic ở `uiDerive.ts`.

import { apiFetch, toQuery } from '@/services/apiClient';
import { decorFor, initialsOf } from '@/services/uiDerive';
import type { Club, ClubFeed, ClubFilter, ClubFilterKey, ClubIconKind, ClubTag } from '@/types/club';
import type { ClubDetail, ClubHighlight, ClubLeader, ClubUpcomingEvent } from '@/types/clubDetail';
import type {
  ClubCategory as ClubCategoryDto,
  ClubDetail as ClubDetailDto,
  ClubDirectory,
  JoinClubRequest,
  StudentActivityItem,
  StudentActivityPage,
} from '@/types/api';

const CAMPUS_FALLBACK = 'FPTU HÀ NỘI - HOLA';

// ---------------------------------------------------------------------------
// Ánh xạ danh mục BE → key của UI
//
// BE dùng code: TECHNOLOGY | ARTS | SPORTS | VOLUNTEER | ACADEMIC | BUSINESS | OTHER
// UI dùng key:  tech | arts | (không có) | community | academic | (không có) | (không có)
// Key `community` gộp VOLUNTEER (vì UI chỉ có 3 nhóm lọc ngoài `all`).
// ---------------------------------------------------------------------------

/** key UI → code BE (để gửi query ?category=). */
const UI_TO_BE_CATEGORY: Record<Exclude<ClubFilterKey, 'all'>, string> = {
  tech: 'TECHNOLOGY',
  arts: 'ARTS',
  community: 'VOLUNTEER',
  academic: 'ACADEMIC',
};

/** code BE → key UI (để hiển thị chip lọc + gán vào Club.groups). */
function beCategoryToUiKey(category: string): ClubFilterKey {
  const up = (category ?? '').trim().toUpperCase();
  if (up === 'TECHNOLOGY') return 'tech';
  if (up === 'ARTS') return 'arts';
  if (up === 'ACADEMIC') return 'academic';
  if (up === 'VOLUNTEER') return 'community';
  // SPORTS / BUSINESS / OTHER không có key tương ứng → gom vào community.
  return 'community';
}

/** Nhãn danh mục hiển thị (tiếng Việt), fallback sang text gốc của BE. */
function categoryLabel(category: string): string {
  const up = (category ?? '').trim().toUpperCase();
  switch (up) {
    case 'TECHNOLOGY':
      return 'Công nghệ & Phần mềm';
    case 'ARTS':
      return 'Nghệ thuật & Âm nhạc';
    case 'SPORTS':
      return 'Thể thao';
    case 'VOLUNTEER':
      return 'Tình nguyện & Cộng đồng';
    case 'ACADEMIC':
      return 'Học thuật';
    case 'BUSINESS':
      return 'Kinh doanh';
    case 'OTHER':
      return 'Khác';
    default:
      return category || 'Khác';
  }
}

/** Icon đại diện theo danh mục. */
function iconKindFor(category: string): ClubIconKind {
  const up = (category ?? '').trim().toUpperCase();
  if (up === 'ARTS') return 'music';
  if (up === 'VOLUNTEER' || up === 'BUSINESS' || up === 'OTHER') return 'megaphone';
  return 'presentation';
}

/** Tag trạng thái tuyển member. */
function recruitingTag(recruiting: boolean): ClubTag {
  return recruiting
    ? { label: 'Đang tuyển thành viên', tone: 'warning' }
    : { label: 'Chờ đợt tuyển mới', tone: 'warning' };
}

/** Trích 1 câu ngắn làm "quote" của banner (không bịa — cắt từ description). */
function quoteFrom(description: string, name: string): string {
  const text = (description ?? '').trim();
  if (!text) return name;
  const firstSentence = text.split(/(?<=[.!?])\s/)[0] ?? text;
  const short = firstSentence.length > 90 ? `${firstSentence.slice(0, 87)}...` : firstSentence;
  return short;
}

/** ClubDirectory (danh sách) → Club của UI. */
function toClub(dto: ClubDirectory): Club {
  const decor = decorFor(dto.code || dto.name);
  const key = beCategoryToUiKey(dto.category);

  return {
    id: String(dto.id),
    code: dto.code,
    name: dto.name,
    categoryLabel: categoryLabel(dto.category),
    groups: [key],
    bannerColor: decor.banner,
    quote: quoteFrom(dto.description, dto.name),
    iconKind: iconKindFor(dto.category),
    iconBg: decor.iconBg,
    iconLabel: undefined,
    tags: [
      { label: categoryLabel(dto.category), tone: 'neutral' },
      recruitingTag(dto.isRecruiting),
    ],
    schedule: dto.scheduleLabel ?? 'Chưa cập nhật lịch sinh hoạt',
    description: dto.description ?? '',
    recruiting: dto.isRecruiting,
  };
}

// ---------------------------------------------------------------------------
// Danh sách CLB (cuộn vô hạn)
//
// BE chưa hỗ trợ phân trang: GET /api/clubs trả TOÀN BỘ danh sách. Vì vậy:
//  - Trang đầu (cursor = null) luôn gọi API để lấy dữ liệu mới.
//  - Các trang sau lấy từ bộ nhớ đệm (cùng từ khóa/bộ lọc, TTL ngắn) và cắt theo offset,
//    không gọi lại mạng mỗi lần cuộn.
// Khi BE hỗ trợ page/pageSize (hoặc cursor), chỉ cần sửa `loadClubList` + `fetchClubs`.
// ---------------------------------------------------------------------------

const LIST_CACHE_TTL_MS = 60_000;
const CATEGORIES_CACHE_TTL_MS = 5 * 60_000;
const DEFAULT_FILTERS: ClubFilter[] = [{ key: 'all', label: 'Tất cả' }];

let listCache: { key: string; at: number; clubs: Club[] } | null = null;
let categoriesCache: { at: number; filters: ClubFilter[] } | null = null;

async function loadClubList(
  keyword: string,
  filter: ClubFilterKey,
  recruitingOnly: boolean,
  forceRefresh: boolean,
): Promise<Club[]> {
  const search = keyword.trim();
  const key = JSON.stringify([search, filter, recruitingOnly]);

  if (
    !forceRefresh &&
    listCache &&
    listCache.key === key &&
    Date.now() - listCache.at < LIST_CACHE_TTL_MS
  ) {
    return listCache.clubs;
  }

  const query = toQuery({
    search: search || null,
    category: filter === 'all' ? null : UI_TO_BE_CATEGORY[filter],
    active: true,
    recruiting: recruitingOnly ? true : null,
  });

  const list = await apiFetch<ClubDirectory[]>(`/api/clubs${query}`);
  const clubs = (list ?? []).map(toClub);
  listCache = { key, at: Date.now(), clubs };
  return clubs;
}

/**
 * GET /api/clubs
 * @param keyword tìm theo tên/mã CLB
 * @param filter all | academic | tech | community | arts
 * @param recruitingOnly chỉ lấy CLB đang tuyển
 * @param cursor vị trí bắt đầu của trang (null = trang đầu). Dùng giá trị `nextCursor` của lần trước.
 * @param limit số CLB mỗi trang. Bỏ trống = trả tất cả (không phân trang).
 */
export async function fetchClubs(params: {
  keyword?: string;
  filter?: ClubFilterKey;
  recruitingOnly?: boolean;
  cursor?: string | number | null;
  limit?: number;
} = {}): Promise<ClubFeed> {
  const { keyword = '', filter = 'all', recruitingOnly = false, cursor = null, limit } = params;

  const clubs = await loadClubList(keyword, filter, recruitingOnly, cursor === null);

  const parsed = cursor === null ? 0 : Number(cursor);
  const offset = Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  const end = limit ? offset + limit : clubs.length;
  const nextCursor = limit && end < clubs.length ? end : null;

  // Lỗi tải danh mục không được làm hỏng cả danh sách CLB.
  const filters = await fetchClubCategories().catch(() => DEFAULT_FILTERS);

  return {
    campus: CAMPUS_FALLBACK,
    total: clubs.length,
    clubs: clubs.slice(offset, end),
    nextCursor,
    filters,
  };
}

/**
 * GET /api/clubs/categories → chip lọc (cache 5 phút).
 * Luôn có 'all' ở đầu; các danh mục BE không có key UI tương ứng bị gom về 'community'.
 */
export async function fetchClubCategories(): Promise<ClubFilter[]> {
  if (categoriesCache && Date.now() - categoriesCache.at < CATEGORIES_CACHE_TTL_MS) {
    return categoriesCache.filters;
  }

  const categories = await apiFetch<ClubCategoryDto[]>('/api/clubs/categories');

  const seen = new Map<ClubFilterKey, string>();
  for (const c of categories ?? []) {
    const key = beCategoryToUiKey(c.code);
    // Nhiều danh mục BE (VOLUNTEER/BUSINESS/OTHER) đều lọc về 'community' —
    // chỉ giữ danh mục đầu tiên, và không để nó ghi đè key có sẵn.
    if (seen.has(key)) continue;
    seen.set(key, c.name);
  }

  const filters: ClubFilter[] = [{ key: 'all', label: 'Tất cả' }];
  for (const key of ['tech', 'community', 'academic', 'arts'] as const) {
    const label = seen.get(key);
    if (label) filters.push({ key, label });
  }

  categoriesCache = { at: Date.now(), filters };
  return filters;
}

/** Chi tiết CLB → các highlight tĩnh dùng chung (UI cần 3 mục). */
function buildHighlights(): ClubHighlight[] {
  return [
    {
      no: '01',
      title: 'Học từ trải nghiệm',
      description:
        'Thử sức trong các hoạt động và dự án có đầu ra cụ thể, gắn liền thực tế doanh nghiệp.',
    },
    {
      no: '02',
      title: 'Những người bạn đồng hành',
      description:
        'Kết nối với các thành viên tài năng cùng sở thích về công nghệ, đào tạo và phát triển.',
    },
    {
      no: '03',
      title: 'Ghi nhận từng đóng góp',
      description:
        'Lưu lại vai trò, sản phẩm thực chiến và được bảo chứng qua portfolio cá nhân.',
    },
  ];
}

/**
 * GET /api/clubs/{id} → ClubDetail của UI.
 *
 * `upcomingEvents` lấy từ feed hoạt động của CLB (2 sự kiện gần nhất).
 */
export async function fetchClubDetail(id: string): Promise<ClubDetail | null> {
  const clubId = Number(id);
  if (!Number.isFinite(clubId)) return null;

  const dto = await apiFetch<ClubDetailDto>(`/api/clubs/${clubId}`);
  const decor = decorFor(dto.code || dto.name);

  const leaders: ClubLeader[] = (dto.publicLeaders ?? []).map((l, index) => ({
    id: `l${index + 1}`,
    name: l.displayName,
    initials: initialsOf(l.displayName),
    term: l.roleLabel,
  }));

  const upcomingEvents = await fetchClubUpcomingEvents(clubId);

  return {
    id: String(dto.id),
    name: dto.name,
    eyebrow: `FPTU XPERIENCE · ${dto.category ?? 'CỘNG ĐỒNG'}`,
    tagline: dto.name,
    slogan: quoteFrom(dto.description, dto.name),
    bannerColor: decor.banner,
    logoBg: decor.logoBg,
    logoCode: (dto.code ?? '').slice(0, 2).toUpperCase() || 'CLB',
    campusLabel: dto.campusCode ?? 'HAN CAMPUS',
    category: categoryLabel(dto.category),
    recruiting: dto.isRecruiting,
    recruitingLabel: dto.isRecruiting ? 'Đang tuyển thành viên' : 'Chờ đợt tuyển mới',
    scheduleSummary: dto.scheduleLabel ?? 'Chưa cập nhật lịch sinh hoạt',
    location: dto.locationLabel ?? null,
    aboutHeading: 'Về câu lạc bộ',
    aboutText: dto.description ?? '',
    hashtags: [],
    highlights: buildHighlights(),
    meet: {
      schedule: dto.scheduleLabel ?? 'Chưa cập nhật lịch sinh hoạt',
      location: dto.locationLabel ?? null,
      size: `${dto.memberCount ?? 0} thành viên`,
      email: dto.contactEmail ?? '',
      hotline: dto.contactPhone ?? '',
    },
    upcomingEvents,
    leaders,
  };
}

/** GET /api/v2/activities/feed?clubId= → 2 hoạt động sắp tới của CLB. */
async function fetchClubUpcomingEvents(clubId: number): Promise<ClubUpcomingEvent[]> {
  try {
    const query = toQuery({ clubId, page: 1, pageSize: 2 });
    const page = await apiFetch<StudentActivityPage>(
      `/api/v2/activities/feed${query}`,
    );

    return (page.items ?? []).map((item: StudentActivityItem) => {
      const start = new Date(item.startTime);
      const day = String(start.getDate()).padStart(2, '0');
      const month = `T${start.getMonth() + 1}`;
      const hh = String(start.getHours()).padStart(2, '0');
      const mm = String(start.getMinutes()).padStart(2, '0');
      const end = new Date(item.endTime);
      const endHm = `${String(end.getHours()).padStart(2, '0')}:${String(end.getMinutes()).padStart(2, '0')}`;

      return {
        id: String(item.id),
        day,
        month,
        title: item.title,
        time: `${hh}:${mm} - ${endHm}`,
        venue: item.location ?? '',
      };
    });
  } catch {
    // Thiếu nguồn sự kiện không được làm hỏng cả trang chi tiết CLB.
    return [];
  }
}

/**
 * POST /api/clubs/{id}/join — gửi hồ sơ gia nhập.
 * Lỗi (409 đã là thành viên, 400 dữ liệu sai…) được apiFetch ném ra dưới dạng
 * ApiError (message tiếng Việt) → UI hiển thị bằng getApiErrorMessage.
 */
export async function joinClub(
  id: string,
  body: JoinClubRequest,
): Promise<{ success: boolean; message: string }> {
  const clubId = Number(id);
  if (!Number.isFinite(clubId)) {
    return { success: false, message: 'Câu lạc bộ không hợp lệ.' };
  }

  await apiFetch(`/api/clubs/${clubId}/join`, { method: 'POST', body });
  return {
    success: true,
    message: 'Hồ sơ của bạn đã được gửi tới ban chủ nhiệm CLB.',
  };
}