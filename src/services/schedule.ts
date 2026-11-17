// services/schedule.ts
//
// Nguồn dữ liệu thật cho màn Lịch trình.
//
// - Sắp diễn ra: GET /api/v2/activities/feed?status=UPCOMING&pageSize=
//   (phân trang theo page, API trả sắp theo thời gian bắt đầu)
// - Đang diễn ra: GET /api/v2/activities/feed?status=LIVE (giới hạn hiển thị)
//
// `attended` để rỗng trong phase này: chưa có nguồn API liệt kê lịch sử điểm danh
// xuyên suốt các hoạt động (my-attendance là per-activity). UI hiện empty state,
// không bịa dữ liệu.

import { apiFetch, toQuery } from '@/services/apiClient';
import { decorFor } from '@/services/uiDerive';
import type { ScheduleEvent, ScheduleFeed } from '@/types/schedule';
import type { StudentActivityItem, StudentActivityPage } from '@/types/api';

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

/**
 * GET /api/v2/activities/feed — màn Lịch trình (tab "Sắp tới").
 *
 * @param cursor số trang (1-based); null = trang đầu.
 * @param limit số hoạt động mỗi trang (pageSize); bỏ trống = 10.
 *
 * "Đang diễn ra" (LIVE) không phân trang: chỉ trang đầu mới tải, giới hạn
 * LIVE_LIMIT item — hoạt động LIVE thay đổi liên tục nên không cần cuộn dài.
 * LIVE lỗi không làm hỏng "sắp tới" (`.catch` riêng).
 */
export async function fetchSchedule(params: {
  campus?: string;
  cursor?: string | number | null;
  limit?: number;
} = {}): Promise<ScheduleFeed> {
  const { campus = '', cursor = null, limit } = params;
  const pageSize = limit ?? 10;
  const page = cursor === null ? 1 : Number(cursor);

  const [upcomingPage, livePage] = await Promise.all([
    apiFetch<StudentActivityPage>(
      `/api/v2/activities/feed${toQuery({ status: 'UPCOMING', page, pageSize })}`,
    ),
    page === 1
      ? apiFetch<StudentActivityPage>(
          `/api/v2/activities/feed${toQuery({ status: 'LIVE', page: 1, pageSize: LIVE_LIMIT })}`,
        ).catch(() => ({ items: [] as StudentActivityItem[] }))
      : Promise.resolve(null),
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
    attended: [],
    total: upcomingPage.totalItems ?? upcomingThisWeek.length,
    // Còn trang tiếp theo → cuộn; không thì null (đã hết).
    nextCursor: page < totalPages ? page + 1 : null,
  };
}
