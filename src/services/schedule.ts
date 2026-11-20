// services/schedule.ts
//
// Nguồn dữ liệu thật cho màn Lịch trình.
//
// - Sắp diễn ra: GET /api/v2/activities/feed?status=UPCOMING&pageSize=
//   (phân trang theo page, API trả sắp theo thời gian bắt đầu)
// - Đang diễn ra: GET /api/v2/activities/feed?status=LIVE (giới hạn hiển thị)
// - Đã tham gia: GET /api/users/me/activity-history (cùng source với web
//   "Lịch trình của tôi" — PersonalPages/MySchedulePage). Lỗi riêng,
//   không làm hỏng tab sắp tới / đang diễn ra.

import { apiFetch, toQuery } from '@/services/apiClient';
import { decorFor } from '@/services/uiDerive';
import type { ScheduleEvent, ScheduleFeed } from '@/types/schedule';
import type {
  StudentActivityItem,
  StudentActivityPage,
  UserActivityHistoryItem,
  UserActivityHistoryPage,
} from '@/types/api';

const CAMPUS_FALLBACK = 'FPTU HÀ NỘI - HOLA';

/** Số hoạt động "đang diễn ra" tối đa hiển thị (LIVE không cần cuộn dài). */
const LIVE_LIMIT = 5;

/** Thứ trong tuần (vi) — dùng cho nhãn "TH 11" (ngày). */
const WEEKDAY_VN = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];

const pad = (n: number) => String(n).padStart(2, '0');

/** StudentActivityItem → ScheduleEvent của UI. */
function toScheduleEvent(item: StudentActivityItem): ScheduleEvent {
  const decor = decorFor(item.clubCode || item.clubName || String(item.id));
  const start = new Date(item.startTime);
  const end = new Date(item.endTime);
  const hhmm = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

  return {
    id: String(item.id),
    day: pad(start.getDate()),
    // "TH 11" = thứ trong tuần + ngày trong tháng.
    month: `${WEEKDAY_VN[start.getDay()]} ${start.getDate()}`,
    dateBoxBg: decor.dateBoxBg,
    dateBoxColor: decor.dateBoxColor,
    club: item.clubName || item.clubCode || '',
    category: item.clubCode || 'Hoạt động',
    name: item.title,
    time: `${hhmm(start)} - ${hhmm(end)}`,
    venue: item.location || '',
    // Đã đăng ký → vé đã xác nhận; chưa đăng ký → chờ check-in.
    status: item.isRegistered ? 'confirmed' : 'pending',
    action: item.isRegistered ? 'qr' : 'ticket',
  };
}

/** Item LIVE → ScheduleEvent: status 'live' (đang diễn ra, sẵn sàng check-in). */
function toLiveEvent(item: StudentActivityItem): ScheduleEvent {
  return {
    ...toScheduleEvent(item),
    status: 'live',
    action: 'qr',
  };
}

// ---------------------------------------------------------------------------
// Tab "Đã tham gia" — GET /api/users/me/activity-history (cùng nguồn với web
// "Lịch trình của tôi"). Khác web: web lọc phiên SẮP TỚI (endTime > now); tab
// này lọc PHIÊN ĐÃ XẢY RA (endTime ≤ now hoặc COMPLETED, loại CANCELLED).
// ---------------------------------------------------------------------------

const HISTORY_PAGE_SIZE = 100;
const MAX_HISTORY_PAGES = 3;
const ATTENDED_LIMIT = 30;

/** Row activity-history → ScheduleEvent của tab "Đã tham gia". */
function toAttendedEvent(row: UserActivityHistoryItem): ScheduleEvent {
  const decor = decorFor(row.clubName || String(row.clubId));
  const start = new Date(row.startTime);
  const end = new Date(row.endTime);
  const hhmm = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

  return {
    id: String(row.activityId),
    day: pad(start.getDate()),
    month: `${WEEKDAY_VN[start.getDay()]} ${start.getDate()}`,
    dateBoxBg: decor.dateBoxBg,
    dateBoxColor: decor.dateBoxColor,
    club: row.clubName || String(row.clubId),
    category: 'Hoạt động',
    name: row.title,
    time: `${hhmm(start)} - ${hhmm(end)}`,
    venue: row.location || '',
    status: 'attended',
    action: 'qr',
  };
}

const isUpper = (v: string | null | undefined, target: string) =>
  (v ?? '').trim().toUpperCase() === target;

/** Row "đã tham gia": phiên đã kết thúc (endTime ≤ now) hoặc COMPLETED; loại CANCELLED. */
function isPastRow(row: UserActivityHistoryItem, now: number): boolean {
  if (isUpper(row.activityStatus, 'CANCELLED') || isUpper(row.sessionStatus, 'CANCELLED')) return false;
  const startMs = Date.parse(row.startTime);
  const endMs = Date.parse(row.endTime);
  if (!Number.isFinite(startMs)) return false;
  const completed = isUpper(row.activityStatus, 'COMPLETED') || isUpper(row.sessionStatus, 'COMPLETED');
  return Number.isFinite(endMs) && (endMs <= now || completed);
}

/**
 * GET /api/users/me/activity-history (chạy tới khi hết trang, giới hạn
 * MAX_HISTORY_PAGES) → list "đã tham gia", mới nhất trước, loại trùng theo
 * activityId, tối đa ATTENDED_LIMIT.
 */
async function fetchAttended(): Promise<ScheduleEvent[]> {
  const now = Date.now();
  const all: UserActivityHistoryItem[] = [];
  let page = 1;
  let total = 1;
  do {
    const data = await apiFetch<UserActivityHistoryPage>(
      `/api/users/me/activity-history${toQuery({ page, pageSize: HISTORY_PAGE_SIZE })}`,
    );
    for (const row of data.items ?? []) all.push(row);
    total = data.totalPages ?? 1;
    page += 1;
  } while (page - 1 < total && page - 1 < MAX_HISTORY_PAGES);

  const seen = new Set<string>();
  return all
    .filter((row) => isPastRow(row, now))
    .sort((a, b) => Date.parse(b.startTime) - Date.parse(a.startTime))
    .filter((row) => {
      const key = String(row.activityId);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, ATTENDED_LIMIT)
    .map(toAttendedEvent);
}

/**
 * GET /api/v2/activities/feed — màn Lịch trình (tab "Sắp tới").
 *
 * @param cursor số trang (1-based); null = trang đầu.
 * @param limit số hoạt động mỗi trang (pageSize); bỏ trống = 10.
 *
 * "Đang diễn ra" (LIVE) và "Đã tham gia" (activity-history) không phân trang:
 * chỉ trang đầu mới tải — LIVE giới hạn LIVE_LIMIT, attended tối đa
 * ATTENDED_LIMIT. Lỗi của hai nguồn này không làm hỏng "sắp tới".
 */
export async function fetchSchedule(params: {
  campus?: string;
  cursor?: string | number | null;
  limit?: number;
} = {}): Promise<ScheduleFeed> {
  const { campus = '', cursor = null, limit } = params;
  const pageSize = limit ?? 10;
  const page = cursor === null ? 1 : Number(cursor);

  const [upcomingPage, livePage, attended] = await Promise.all([
    apiFetch<StudentActivityPage>(
      `/api/v2/activities/feed${toQuery({ status: 'UPCOMING', page, pageSize })}`,
    ),
    page === 1
      ? apiFetch<StudentActivityPage>(
          `/api/v2/activities/feed${toQuery({ status: 'LIVE', page: 1, pageSize: LIVE_LIMIT })}`,
        ).catch(() => ({ items: [] as StudentActivityItem[] }))
      : Promise.resolve(null),
    page === 1 ? fetchAttended().catch(() => [] as ScheduleEvent[]) : Promise.resolve([] as ScheduleEvent[]),
  ]);

  // API trả sắp theo giờ bắt đầu; bỏ qua item đã bắt đầu (khung giờ trôi qua).
  const now = Date.now();
  const upcomingThisWeek = (upcomingPage.items ?? [])
    .filter((item) => new Date(item.startTime).getTime() > now)
    .map(toScheduleEvent);

  // LIVE: giữ nguyên thứ tự API trả (đang diễn ra). Trang đầu mới có.
  const live = livePage ? (livePage.items ?? []).map(toLiveEvent) : [];

  const totalPages = upcomingPage.totalPages ?? 1;

  return {
    campus: campus || CAMPUS_FALLBACK,
    upcomingThisWeek,
    live,
    attended,
    total: upcomingPage.totalItems ?? upcomingThisWeek.length,
    // Còn trang tiếp theo → cuộn; không thì null (đã hết).
    nextCursor: page < totalPages ? page + 1 : null,
  };
}
