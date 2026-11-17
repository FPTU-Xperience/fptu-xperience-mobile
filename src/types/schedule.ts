// types/schedule.ts
export type ScheduleTabKey = 'upcoming' | 'live' | 'attended';
export type TicketStatus = 'confirmed' | 'pending' | 'live' | 'attended';
export type TicketAction = 'qr' | 'ticket';

export interface ScheduleEvent {
  id: string;
  day: string;
  /** Vd: "TH 11" */
  month: string;
  dateBoxBg: string;
  dateBoxColor: string;
  club: string;
  category: string;
  name: string;
  time: string;
  venue: string;
  status: TicketStatus;
  action: TicketAction;
}

export interface ScheduleFeed {
  campus: string;
  /** "Sắp tới" — danh sách phẳng, cuộn vô hạn (API sắp theo giờ bắt đầu). */
  upcomingThisWeek: ScheduleEvent[];
  /** Hoạt động đang diễn ra (LIVE) — có source API riêng (chỉ trang đầu). */
  live: ScheduleEvent[];
  attended: ScheduleEvent[];
  /** Tổng số hoạt động sắp tới (từ API). */
  total?: number;
  /** Số trang tiếp theo cho cuộn vô hạn; null = đã hết. */
  nextCursor?: string | number | null;
}