// services/recommendation.ts
//
// Nguồn dữ liệu thật cho màn Khám phá (explore).
//
// - Gợi ý hoạt động: GET /api/v2/recommendations/activities?limit=6&scope=PERIOD
// - Gợi ý CLB:      GET /api/v2/recommendations/clubs?limit=6&scope=PERIOD
//
// Quy tắc quan trọng: endpoint gợi ý trả `available:false` khi chưa có dữ liệu
// xử lý / chính sách điểm chưa duyệt. Lúc đó KHÔNG được bịa — service fallback
// sang feed/danh sách chuẩn để người dùng vẫn thấy nội dung thật.
//
// `hero`, `quickActions`, `moreCta` là copy marketing tĩnh (không phải dữ liệu
// API) nên khai báo hằng số ở đây.

import { apiFetch, toQuery } from '@/services/apiClient';
import { decorFor } from '@/services/uiDerive';
import type {
  RecoClub,
  RecoClubCategoryKey,
  RecoEvent,
  RecoEventFilterKey,
  RecoFilter,
  RecoHero,
  RecoMoreCta,
  RecoQuickAction,
  RecommendationQuery,
  RecommendationResponse,
} from '@/types/recommendation';
import type {
  ClubDirectory,
  RecommendedActivitiesResponse,
  RecommendedClubsResponse,
  StudentActivityItem,
  StudentActivityPage,
} from '@/types/api';

const CAMPUS_FALLBACK = 'FPTU HÀ NỘI - HOLA';
// Số hoạt động gợi ý mỗi lần (endpoint giới hạn tối đa 6).
const EVENT_LIMIT = 6;
// Section "Câu lạc bộ dành cho bạn": pool lấy từ API gợi ý
// /api/v2/recommendations/clubs (backend trả về tối đa 18 CLB), chia đúng
// 3 trang × 6 CLB. Nếu API trả >18 thì CHỈ GIỮ 18 (3 trang), bỏ phần thừa.
const CLUBS_PAGE_SIZE = 6;
const CLUBS_MAX_PAGES = 3;
const CLUBS_MAX_POOL = CLUBS_PAGE_SIZE * CLUBS_MAX_PAGES; // 18

// ---------------------------------------------------------------------------
// Copy tĩnh (marketing) — không phải dữ liệu API.
// ---------------------------------------------------------------------------

const HERO: RecoHero = {
  eyebrow: 'FPTU HOLA CAMPUS',
  title: 'Trải nghiệm',
  highlight: 'cùng cộng đồng',
  description:
    'Khám phá hoạt động, câu lạc bộ và cơ hội mới mỗi ngày tại FPTU Hola Campus.',
  primaryCta: 'Khám phá hoạt động',
  secondaryCta: 'Xem câu lạc bộ',
  miniCards: [
    { id: 'm1', label: 'Sắp diễn ra', title: 'Hoạt động tuần này', tone: 'dark' },
    { id: 'm2', label: 'Cộng đồng', title: 'Câu lạc bộ đang tuyển', tone: 'light' },
  ],
  socialProof: {
    avatars: ['LH', 'PV', 'AN', 'TD'],
    text: 'Hơn 2.000 sinh viên đã tham gia',
  },
};

const QUICK_ACTIONS: RecoQuickAction[] = [
  { id: 'q1', label: 'Hoạt động', icon: 'compass', route: 'activity' },
  { id: 'q2', label: 'Lịch trình', icon: 'calendar', route: 'schedule' },
  { id: 'q3', label: 'Câu lạc bộ', icon: 'users', route: 'allClubs' },
];

const MORE_CTA: RecoMoreCta = {
  eyebrow: 'CÒN NHIỀU HƠN',
  text: 'Xem toàn bộ hoạt động và câu lạc bộ tại campus.',
  button: 'Xem tất cả',
};

const EVENT_FILTERS: RecoFilter<RecoEventFilterKey>[] = [
  { key: 'all', label: 'Tất cả' },
  { key: 'upcoming', label: 'Sắp diễn ra' },
  { key: 'ongoing', label: 'Đang diễn ra' },
];

const CLUB_FILTERS: RecoFilter<RecoClubCategoryKey>[] = [
  { key: 'all', label: 'Tất cả' },
  { key: 'tech', label: 'Công nghệ' },
  { key: 'community', label: 'Cộng đồng' },
  { key: 'academic', label: 'Học thuật' },
];

// ---------------------------------------------------------------------------
// Mapping DTO → UI
// ---------------------------------------------------------------------------

/** StudentActivityItem → RecoEvent. */
function toRecoEvent(item: StudentActivityItem): RecoEvent {
  const decor = decorFor(item.clubCode || item.clubName || String(item.id));
  const start = new Date(item.startTime);
  const end = new Date(item.endTime);
  const pad = (n: number) => String(n).padStart(2, '0');
  const hhmm = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

  const raw = item.status?.trim().toUpperCase();
  const status: RecoEvent['status'] =
    raw === 'LIVE' || raw === 'ONGOING' || raw === 'IN_PROGRESS' ? 'ongoing' : 'upcoming';

  return {
    id: String(item.id),
    club: item.clubName || item.clubCode || '',
    status,
    title: item.title,
    bannerLocation: item.location || '',
    bannerColor: decor.banner,
    day: pad(start.getDate()),
    month: String(start.getMonth() + 1).padStart(2, '0'),
    dateBoxBg: decor.dateBoxBg,
    dateBoxColor: decor.dateBoxColor,
    name: item.title,
    time: `${hhmm(start)} - ${hhmm(end)}`,
    venue: item.location || '',
  };
}

/** ClubDirectory → RecoClub. */
function toRecoClub(dto: ClubDirectory): RecoClub {
  const decor = decorFor(dto.code || dto.name);
  const up = (dto.category ?? '').trim().toUpperCase();

  const category: RecoClubCategoryKey =
    up === 'TECHNOLOGY'
      ? 'tech'
      : up === 'ACADEMIC'
        ? 'academic'
        : up === 'ARTS'
          ? 'community'
          : 'community';

  const categoryLabelMap: Record<string, string> = {
    TECHNOLOGY: 'CÔNG NGHỆ & PHẦN MỀM',
    ARTS: 'ÂM NHẠC & NGHỆ THUẬT',
    SPORTS: 'THỂ THAO',
    VOLUNTEER: 'TÌNH NGUYỆN & CỘNG ĐỒNG',
    ACADEMIC: 'HỌC THUẬT',
    BUSINESS: 'KINH DOANH',
    OTHER: 'KHÁC',
  };

  return {
    id: String(dto.id),
    code: dto.code,
    name: dto.name,
    category,
    categoryLabel: categoryLabelMap[up] ?? (dto.category || 'CLB').toUpperCase(),
    recruiting: dto.isRecruiting,
    recruitingLabel: dto.isRecruiting ? 'Đang tuyển thành viên' : 'Chờ đợt tuyển mới',
    hubLabel: dto.campusCode || 'HOLA CAMPUS',
    tagline: dto.description ?? '',
    bannerColor: decor.banner,
    logoBg: decor.logoBg,
    logoText: (dto.code ?? '').slice(0, 2).toUpperCase() || 'CLB',
    schedule: dto.scheduleLabel ?? null,
    description: dto.description ?? '',
  };
}

/** StudentClubMetadata (từ API gợi ý /recommend) → RecoClub. */
function toRecoClubFromMeta(meta: {
  clubId: number;
  clubCode: string;
  clubName: string;
  category: string;
  campusCode: string;
  isRecruiting: boolean;
}): RecoClub {
  const decor = decorFor(meta.clubCode || meta.clubName);
  const up = (meta.category ?? '').trim().toUpperCase();
  const category: RecoClubCategoryKey =
    up === 'TECHNOLOGY' ? 'tech' : up === 'ACADEMIC' ? 'academic' : 'community';

  return {
    id: String(meta.clubId),
    code: meta.clubCode,
    name: meta.clubName,
    category,
    categoryLabel: (meta.category || 'CLB').toUpperCase(),
    recruiting: meta.isRecruiting,
    recruitingLabel: meta.isRecruiting ? 'Đang tuyển thành viên' : 'Chờ đợt tuyển mới',
    hubLabel: meta.campusCode || 'HOLA CAMPUS',
    tagline: '',
    bannerColor: decor.banner,
    logoBg: decor.logoBg,
    logoText: (meta.clubCode ?? '').slice(0, 2).toUpperCase() || 'CLB',
    schedule: null,
    description: '',
  };
}

// ---------------------------------------------------------------------------
// Fetch
// ---------------------------------------------------------------------------

/** Hoạt động gợi ý; fallback sang feed thường khi endpoint gợi ý không khả dụng. */
async function fetchRecoEvents(query: RecommendationQuery): Promise<RecoEvent[]> {
  const statusFilter =
    query.eventStatus === 'upcoming'
      ? 'UPCOMING'
      : query.eventStatus === 'ongoing'
        ? 'LIVE'
        : null;

  // 1) Thử endpoint gợi ý.
  try {
    const params = toQuery({
      limit: EVENT_LIMIT,
      scope: 'PERIOD',
      semesterId: null,
    });
    const rec = await apiFetch<RecommendedActivitiesResponse>(
      `/api/v2/recommendations/activities${params}`,
    );

    if (rec.available && rec.items?.length) {
      let items = rec.items.map((r) => r.activity);
      if (statusFilter) {
        items = items.filter(
          (a) => a.status?.trim().toUpperCase() === statusFilter,
        );
      }
      return items.map(toRecoEvent);
    }
  } catch {
    // Rơi xuống feed thường bên dưới.
  }

  // 2) Fallback: feed hoạt động thật.
  const feedQuery = toQuery({
    status: statusFilter,
    search: query.keyword?.trim() || null,
    page: 1,
    pageSize: EVENT_LIMIT,
  });
  const page = await apiFetch<StudentActivityPage>(
    `/api/v2/activities/feed${feedQuery}`,
  );
  return (page.items ?? []).map(toRecoEvent);
}

/**
 * Pool CLB gợi ý (đã lọc theo từ khoá + danh mục, CHẶN ở CLUBS_MAX_POOL) để
 * phân trang phía client.
 *
 * Nguồn chính: API gợi ý riêng /api/v2/recommendations/clubs (trả về tối đa
 * 18 CLB). Nếu API gợi ý không khả dụng (available:false / lỗi), fallback sang
 * DANH LỤC CLB thật (GET /api/clubs) để người dùng vẫn thấy nội dung thật.
 * Dù nguồn trả bao nhiêu, pool luôn bị cắt ở CLUBS_MAX_POOL (18) để phân trang
 * đúng 3 trang × 6 CLB (thừa thì bỏ).
 */
async function loadAllClubs(query: RecommendationQuery): Promise<RecoClub[]> {
  const keyword = query.keyword?.trim() || null;
  const matchesKeyword = (c: RecoClub) =>
    !keyword ||
    c.name.toLowerCase().includes(keyword.toLowerCase()) ||
    c.code.toLowerCase().includes(keyword.toLowerCase());
  const matchesCategory = (c: RecoClub) =>
    query.category === 'all' || c.category === query.category;

  // 1) Nguồn chính: API gợi ý CLB riêng.
  try {
    const params = toQuery({ limit: CLUBS_MAX_POOL, scope: 'PERIOD' });
    const rec = await apiFetch<RecommendedClubsResponse>(
      `/api/v2/recommendations/clubs${params}`,
    );
    if (rec.available && rec.items?.length) {
      const items = rec.items
        .map((r) => toRecoClubFromMeta(r.club))
        .filter((c) => matchesKeyword(c) && matchesCategory(c));
      if (items.length) return items.slice(0, CLUBS_MAX_POOL);
    }
  } catch {
    // Rơi xuống danh sách CLB thật bên dưới.
  }

  // 2) Fallback: danh sách CLB thật (toàn bộ active), cắt ở CLUBS_MAX_POOL.
  const listQuery = toQuery({ active: true, search: keyword });
  const list = await apiFetch<ClubDirectory[]>(`/api/clubs${listQuery}`);
  return (list ?? [])
    .map(toRecoClub)
    .filter((c) => matchesKeyword(c) && matchesCategory(c))
    .slice(0, CLUBS_MAX_POOL);
}

/**
 * CLB, phân trang phía client: đúng CLUBS_MAX_PAGES trang, CLUBS_PAGE_SIZE CLB/trang.
 * Pool đã bị chặn ở CLUBS_MAX_POOL (18) trong loadAllClubs → pageCount tối đa 3.
 */
async function fetchRecoClubs(query: RecommendationQuery): Promise<
  { clubs: RecoClub[]; page: number; total: number; pageCount: number }
> {
  const all = await loadAllClubs(query);
  const pageCount = Math.min(
    CLUBS_MAX_PAGES,
    Math.max(1, Math.ceil(all.length / CLUBS_PAGE_SIZE)),
  );
  const page = Math.min(Math.max(1, query.page ?? 1), pageCount);
  const start = (page - 1) * CLUBS_PAGE_SIZE;
  return {
    clubs: all.slice(start, start + CLUBS_PAGE_SIZE),
    page,
    total: all.length,
    pageCount,
  };
}

// ---------------------------------------------------------------------------
// API công khai cho màn Khám phá — tách 2 phần để UI chỉ refetch đúng phần đổi:
//   - fetchRecoBase: hero + events (không phụ thuộc page)
//   - fetchRecoClubsSection: chỉ section CLB (phân trang) — bấm next/prev
//     chỉ gọi lại hàm này, phần events trên màn giữ nguyên.
// ---------------------------------------------------------------------------

/** Phần nền: hero/quickActions/moreCta + hoạt động gợi ý (không phân trang). */
export async function fetchRecoBase(
  query: RecommendationQuery = {},
): Promise<Pick<RecommendationResponse, 'campus' | 'hero' | 'quickActions' | 'events' | 'moreCta'>> {
  const events = await fetchRecoEvents(query);
  return {
    campus: CAMPUS_FALLBACK,
    hero: HERO,
    quickActions: QUICK_ACTIONS,
    events: { filters: EVENT_FILTERS, items: events },
    moreCta: MORE_CTA,
  };
}

/** Section "Câu lạc bộ dành cho bạn" (3 trang × 6 CLB, pool từ API gợi ý). */
export async function fetchRecoClubsSection(
  query: RecommendationQuery = {},
): Promise<RecommendationResponse['clubs']> {
  const clubs = await fetchRecoClubs(query);
  return {
    filters: CLUB_FILTERS,
    items: clubs.clubs,
    // `clubs.page` đã clamp trong fetchRecoClubs (1..pageCount) — nhất quán
    // với pageCount để Pagination không bao giờ hiện trang ngoài khoảng.
    pagination: {
      page: clubs.page,
      pageCount: clubs.pageCount,
      total: clubs.total,
    },
  };
}
