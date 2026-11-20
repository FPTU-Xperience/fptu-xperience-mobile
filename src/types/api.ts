// types/api.ts
//
// DTOs tương ứng 1:1 (camelCase) với response của FPTU ClubHub API Gateway.
// Nguồn: fptu-xperience-clubhub-api (YARP Gateway → microservices .NET 8).
// Các field optional đánh dấu `?` là field không chắc chắn shape — chú thích // ?
// kèm theo. Phase sau (3-4) sẽ rà lại từng screen và siết chặt nếu cần.

// ============================ AUTH / USER ============================

/**
 * POST /api/auth/google | /api/auth/email-login
 * (dùng cho Phase 7 — login thật. Đợt này dùng dev token, chưa gọi.)
 */
export interface AuthResponse {
  accessToken: string;
  expiresAtUtc: string; // ISO
  user: UserSummary;
  refreshToken?: string | null;
  refreshTokenExpiresAtUtc?: string | null;
}

/** POST /api/auth/refresh → AuthResponse */
export type RefreshResponse = AuthResponse;

export interface UserSummary {
  id: number;
  username: string;
  fullName: string;
  email: string;
  roles: string[];
  isActive: boolean;
  isLocked: boolean;
  campusCode?: string | null;
}

/** GET /api/users/me */
export type UserMeResponse = UserSummary;

// ============================ CLUBS ============================

/** GET /api/clubs/categories */
export interface ClubCategory {
  id: number;
  code: string;
  name: string;
  description: string;
  count: number;
  createdAtUtc: string;
}

export interface ManagerAssignment {
  id: number;
  managerUserId: number;
  managerName: string;
  assignedAtUtc: string;
  endedAtUtc: string | null;
  isActive: boolean;
}

/** GET /api/clubs?active=true&search=&category=&campus=&recruiting= (trả về array) */
export interface ClubDirectory {
  id: number;
  code: string;
  name: string;
  category: string;
  description: string;
  logoUrl: string | null;
  contactEmail: string;
  contactPhone: string;
  scheduleLabel: string | null;
  isRecruiting: boolean;
  memberCount: number;
  isActive: boolean;
  managers: ManagerAssignment[];
  campusCode: string;
}

export interface ClubPublicLeader {
  displayName: string;
  roleLabel: string;
}

/**
 * GET /api/clubs/{id}
 * Trả ClubPublicDetail cho student; trả ClubResponse (nhiều field hơn, private)
 * cho manager/SA — UI dùng shape này, các field private là optional.
 */
export interface ClubDetail {
  id: number;
  code: string;
  name: string;
  category: string;
  description: string;
  logoUrl: string | null;
  scheduleLabel: string | null;
  isRecruiting: boolean;
  coverImageUrl: string | null;
  locationLabel: string | null;
  memberCount: number;
  contactEmail: string;
  contactPhone: string;
  publicLeaders: ClubPublicLeader[];
  isActive: boolean;
  campusCode: string;
  version: string; // GUID
  /** Structured weekly schedule — shape do BE quyết định (JsonElement). */
  schedule?: unknown;
  expectedLocation: string;
  majorEvents: string;
  equipmentNeeds: string;
  advisorNeeded: boolean;
}

export interface ClubMember {
  id: number;
  clubId: number;
  clubName: string;
  clubCategory: string;
  userId: number;
  fullName: string;
  role: string;
  status: string;
  requestMessage: string | null;
  reviewNote: string | null;
  requestedAtUtc: string;
  reviewedAtUtc: string | null;
}

/** POST /api/clubs/{id}/join — bắt buộc 4 trường đầu; các trường còn lại optional. */
export interface JoinClubRequest {
  fullName: string;
  email: string;
  phoneNumber: string;
  reason: string;
  dateOfBirth?: string | null;
  gender?: string;
  address?: string | null;
  hobbies?: string | null;
  skills?: string | null;
  expectations?: string | null;
  contributions?: string | null;
  additionalInfo?: Record<string, string> | null;
  /** Bắt buộc = true (đồng ý nội quy CLB). */
  acceptedClubRules: boolean;
  /** Bắt buộc = true (cam kết tham gia). */
  committedToParticipate: boolean;
  message?: string | null;
}

export interface OperationResult {
  success: boolean;
  message?: string;
}

/** GET /api/clubs/me/access */
export interface ClubAccess {
  clubId: number;
  clubName: string;
  isManager: boolean;
  isTreasurer: boolean;
  isApprovedMember: boolean;
  managerUserIds: number[];
  memberUserIds: number[];
  treasurerUserIds: number[];
  isVicePresident?: boolean;
  accessValidUntilUtc?: string | null;
}

/** GET /api/clubs/me/membership-applications (array) */
export interface SelfMembershipApplication {
  id: number;
  clubId: number;
  clubName: string;
  status: string; // PENDING | APPROVED | REJECTED
  requestedAtUtc: string;
  reviewNote: string | null;
  canWithdraw: boolean;
  canAcceptInvitation?: boolean;
}

/**
 * GET /api/clubs/me/memberships → ClubMembershipResponse[]
 * (shape đầy đủ hơn SelfMembershipApplication: có clubCode, role, canWithdraw...)
 */
export interface ClubMembershipResponse {
  id: number;
  clubId: number;
  clubName: string;
  clubCategory: string;
  userId: number;
  fullName: string;
  role: string;
  status: string; // Pending | Approved | Rejected | Withdrawn
  requestMessage: string | null;
  reviewNote: string | null;
  requestedAtUtc: string;
  reviewedAtUtc: string | null;
  version: string;
  clubCode: string;
  logoUrl: string | null;
  source: string;
  semesterId: string | null;
  canAcceptInvitation: boolean;
  canWithdraw: boolean;
}

// ============================ ACTIVITIES (student feed / v2) ============================

export interface PillarWeight {
  pillar: string;
  weight: number;
}

/** Item trong GET /api/v2/activities/feed và GET /api/v2/activities/{id} */
export interface StudentActivityItem {
  id: number;
  clubId: number;
  clubCode: string;
  clubName: string;
  title: string;
  description: string;
  coverImageUrl: string | null;
  startTime: string; // ISO UTC
  endTime: string; // ISO UTC
  location: string;
  status: string; // UPCOMING | LIVE | COMPLETED
  nextAction: string; // REGISTER | CHECK_IN | VIEW
  canRegister: boolean;
  isEligible: boolean;
  semesterId: string | null;
  nextSessionId: number | null;
  version: string;
  sessionVersion: string | null;
  policyVersion: string | null;
  pillarWeights: PillarWeight[];
  nextSessionStartTimeUtc: string | null;
  isInternal: boolean;
  isRegistered: boolean;
  canCancelRegistration: boolean;
  registrationVersion: string | null;
}

/** GET /api/v2/activities/feed?page=&pageSize=&status=&search=&clubId=&semesterId= */
export interface StudentActivityPage {
  items: StudentActivityItem[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  asOf: string;
  scopeVersion: string;
}

/**
 * Row trong GET /api/users/me/activity-history — phiên/điểm danh/tham gia của tôi.
 * (Trùng shape với web: fptu-xperience-clubhub-ui `loadStudentActivitySchedule`.)
 */
export interface UserActivityHistoryItem {
  activityId: number;
  title: string;
  clubId: number;
  clubName: string;
  activityStatus: string;
  sessionId: number | null;
  sessionStatus: string | null;
  semesterId: string | null;
  startTime: string; // ISO UTC
  endTime: string; // ISO UTC
  location: string;
  sourceNamespace: string;
  isLegacy: boolean;
  isAuthoritative: boolean;
  attendanceId: number | null;
  attendanceDate: string | null;
  attendanceStatus: string;
  verificationStatus: string;
  recognitionStatus: string;
  contributionId: number | null;
  checkedInAt: string | null;
}

/** GET /api/users/me/activity-history?page=&pageSize= */
export interface UserActivityHistoryPage {
  items: UserActivityHistoryItem[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  asOf: string;
}

export interface FetchActivitiesParams {
  clubId?: number | null;
  search?: string | null;
  status?: 'UPCOMING' | 'LIVE' | null;
  semesterId?: string | null;
  page?: number;
  pageSize?: number;
}

/** POST /api/activities/{id}/participants | /registration/cancel */
export interface ParticipantResult {
  success: boolean;
  participant?: {
    fullName: string;
    registeredAtUtc: string;
  };
}

export interface AttendanceLocation {
  latitude: number;
  longitude: number;
  accuracy?: number | null;
}

/** POST /api/activities/{id}/check-in */
export interface SessionCheckInRequest {
  sessionId: number;
  challenge: string;
  location?: AttendanceLocation | null;
}

/** Response của POST /api/activities/{id}/check-in */
export interface AttendanceRecord {
  attendanceId: number;
  activityId: number;
  sessionId: number;
  status: string; // VerificationStatus: VERIFIED | PENDING | REVOKED...
  attendanceStatus: string; // Present | Absent | Late | ...
  verificationMethod: string;
  verifiedAt: string;
  contributionId: string | null;
  recognitionStatus: string;
  version: string;
}

/** Item trong GET /api/activities/{id}/my-attendance (ActivityAttendanceResponse) */
export interface ActivityAttendanceResponse {
  id: number;
  userId: number;
  fullName: string;
  /** DateOnly → "YYYY-MM-DD" */
  attendanceDate: string;
  status: string;
  note: string | null;
  checkedInAtUtc: string | null;
  checkedInByUserId: number | null;
  sessionId: number | null;
  version: string;
  verificationStatus: string;
}

/** GET /api/activities/{id}/my-attendance?page=&pageSize= */
export interface MyAttendancePage {
  activityId: number;
  userId: number;
  total: number;
  page: number;
  pageSize: number;
  items: ActivityAttendanceResponse[];
}

/** GET /api/activities/{id}/resources */
export interface ActivityResource {
  id: string;
  kind: string; // IMAGE | VIDEO | DOCUMENT | EMBED
  title: string;
  visibility: string; // PUBLIC | CLUB_ONLY
  url: string;
  provider: string;
  position: number;
}

export interface ActivityResourceGallery {
  items: ActivityResource[];
  availability: string; // AVAILABLE | UNAVAILABLE
}

/** GET /api/activities/{id}/sessions/{sessionId}/attendance-challenge */
export interface AttendanceChallengeResponse {
  challenge: string;
  issuedAt: string;
  expiresAt: string;
  serverTime: string;
  sessionId: number;
}

// ============================ PROFILE / EXPERIENCE ============================

/** GET /api/users/me/profile (shape theo CanonicalProfileEndpoints.Response) */
export interface SelfProfileResponse {
  userId: number;
  /** GUID string — gửi lại làm `expectedVersion` khi PATCH (409 STALE_PROFILE khi lệch). */
  version: string;
  profileSource: string;
  identityProvenance: string;
  profile: {
    displayName: string;
    about: string;
    skills: string[];
    interests: string[];
    headline: string;
    avatarUrl: string | null;
    coverImageUrl: string | null;
  };
  personal: {
    phoneNumber: string | null;
    /** "yyyy-MM-dd" | null (chỉ có khi account đã onboarding) */
    dateOfBirth?: string | null;
    address?: string | null;
  };
  academic: {
    major: string | null;
    /** "NO_AUTHORITATIVE_SOURCE" | "SELF_DECLARED" */
    majorAvailability: string;
  };
  /** Ví dụ "profile.displayName", "academic.major" — field nào được phép sửa. */
  editableFields: string[];
  /** Chỉ có khi account đã onboarding (includePrivate). */
  onboarding?: {
    version: number;
    syncTimetable: boolean;
    completedAt: string | null;
  };
}

/** Item trục trong StudentRadarResponse.pillars / radarAxes / plusOne */
export interface PillarRadarItem {
  pillar: string;
  rawPointsSum: number;
  tau: number;
  saturatedScore: number; // 0..100 (đã bão hòa)
  masteryTier: string;
  hasLeaderProof: boolean;
}

/** GET /api/v1/declarations/me/radar?semester= */
export interface StudentRadar {
  studentId: number;
  studentName: string;
  studentEmail: string;
  semesterCode: string;
  d: number;
  j: number;
  m: number;
  eri: number;
  profileTitle: string;
  approvedDeclarationsCount: number;
  pillars: PillarRadarItem[];
  policyVersion?: string | null;
  isAuthoritative: boolean;
  approvedClubContributionsCount?: number;
  scope: string;
  semesterId?: string | null;
  formulaVersion: string;
  contributionFormulaVersion: string;
  ledgerRevision: number;
  asOf: string;
  version: string;
  radarAxes: PillarRadarItem[];
  plusOne?: PillarRadarItem | null;
}

/** GET /api/users/me/experience-summary?semester=&scope= */
export interface ExperienceSummary {
  userId: number;
  scope: string;
  semesterId: string | null;
  recognizedContributionCount: number;
  rawExperiencePoints: number;
  verifiedAttendanceCount: number | null;
  approvedClubCount: number | null;
  availability: {
    contributions: boolean;
    radar: boolean;
    attendance: boolean;
    clubs: boolean;
    externalSourceReason: string;
  };
  policyVersion?: string | null;
  formulaVersion?: string | null;
  asOf: string;
  version: string;
}

export interface ContributionAttributes {
  tier: string;
  role: string;
  scale: string;
  result: string;
  pillarWeights: PillarWeight[];
}

/** GET /api/users/me/contributions?page=&pageSize=&semesterId=&status=&pillar= */
export interface Contribution {
  id: string;
  userId: number;
  sourceType: string;
  sourceId: string | null;
  clubId: number | null;
  activityId: number | null;
  sessionId: number | null;
  semesterId: string;
  occurredAt: string;
  title: string;
  message: string;
  status: string; // SUBMITTED | APPROVED | REJECTED | ...
  version: string;
  proposedAttributes: ContributionAttributes;
  verifiedAttributes: ContributionAttributes | null;
  evidenceRefs: string[];
  rawPoints: number;
  recognitionStatus: string;
  updatedAt: string;
}

/** GET /api/users/me/contributions → { items, page, pageSize, total, totalPages } */
export interface Paged<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

// ============================ SCHEDULE ============================

/** GET /api/academic-calendar/{year}/{term} (contract: study-schedule-api.md) */
export interface AcademicCalendar {
  year: number;
  term: string; // SP | SU | FA
  semesterKey: string;
  semesterId: string;
  campusCode: string;
  version: string;
  isActive: boolean;
  canWrite: boolean;
  availability: string; // UNCONFIGURED | AVAILABLE | STALE_CONFIGURATION
  termStartDate: string;
  block10StartDate: string;
  block3StartDate: string;
}

export interface ScheduleEntry {
  week: number;
  day: string; // mon..sun
  slotId: string;
  subject: string;
  room: string | null;
}

/** GET /api/users/me/study-schedule/{year}/{term}/{block} */
export interface StudySchedule {
  year: number;
  term: string;
  block: string; // 10W | 3W
  version: string;
  calendarVersion: string;
  semesterKey: string;
  semesterId: string;
  campusCode: string;
  availability: string;
  canWrite: boolean;
  entries: ScheduleEntry[];
}

// ============================ RECOMMENDATIONS ============================

/** Item trong GET /api/v2/recommendations/clubs (shape theo recommendation item + ClubDirectory). */
export interface RecommendedClubItem {
  clubId: number;
  clubCode: string;
  clubName: string;
  category: string;
  campusCode: string;
  isRecruiting: boolean;
  isApprovedMember: boolean;
  /** Lý do gợi ý (nếu có). */
  reason?: string;
}

/** StudentClubMetadata — club trong scope của student. */
export interface StudentClubMetadata {
  clubId: number;
  clubCode: string;
  clubName: string;
  category: string;
  campusCode: string;
  isApprovedMember: boolean;
  canViewPrivate: boolean;
  joinedAt: string | null;
  version: string;
  membershipVersion: string | null;
  isRecruiting: boolean;
}

/** Item gợi ý hoạt động — activity nằm trong `activity`. */
export interface RecommendedActivityItem {
  recommendationId: string;
  rank: number;
  targetPillar?: string;
  reason: string;
  reasons?: string[];
  score?: number;
  suggestedSessionIds?: number[];
  ruleVersion?: string;
  sourceLabel?: string;
  activity: StudentActivityItem;
}

/** Item gợi ý CLB — club nằm trong `club`. */
export interface RecommendedClubEntry {
  recommendationId: string;
  rank: number;
  score?: number;
  reasons?: string[];
  club: StudentClubMetadata;
}

/**
 * GET /api/v2/recommendations/activities?limit=1..6&scope=PERIOD
 * Khi `available:false` thì `items` rỗng — UI phải fallback sang feed thường.
 */
export interface RecommendedActivitiesResponse {
  items: RecommendedActivityItem[];
  available: boolean;
  status: string;
  sourceLabel?: string;
  generatedAt?: string;
  expiresAt?: string;
}

/**
 * GET /api/v2/recommendations/clubs?limit=1..6&scope=PERIOD
 */
export interface RecommendedClubsResponse {
  items: RecommendedClubEntry[];
  available: boolean;
  status: string;
  sourceLabel?: string;
  generatedAt?: string;
  expiresAt?: string;
}

// ============================ NOTIFICATIONS ============================

/** GET /api/notifications?unreadOnly=true (shape theo NotificationResponse) */
export interface Notification {
  id: number;
  eventType: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAtUtc: string;
}

// ============================ CONTRIBUTIONS (Phase 5 — tab minh chứng) ============================

// Tái dùng `Contribution` + `ContributionAttributes` (đã có sẵn ở trên) cho
// item chuẩn. Chỉ khai báo thêm item LEGACY + wrapper trang (union 2 loại item,
// vì backend `StudentContributionReadService` UNION canonical + SelfDeclarations).

/**
 * Kê khai cá nhân cũ (SelfDeclarations) — backend UNION chung với contribution
 * chuẩn trong StudentContributionReadService.PageAsync (row.Legacy).
 * Khác `Contribution`: không có `clubId`, điểm ở `legacyRawPointsPreview` (nullable).
 */
export interface LegacyContributionItem {
  id: string;
  userId: number;
  sourceType: string;
  sourceNamespace: string;
  sourceKey: string;
  sourceId: string | null;
  semesterId: string | null;
  occurredAt: string;
  title: string;
  status: string;
  isAuthoritative: boolean;
  legacyRawPointsPreview: number | null;
  calculationBreakdown?: unknown | null;
  verifiedAttributes?: unknown | null;
  evidenceRefs: string[];
}

/**
 * GET /api/users/me/contributions?semesterId&status&pillar&page&pageSize
 * Sắp giảm theo CreatedAtUtc; `items` là union Contribution | LegacyContributionItem.
 * (Không dùng `Paged<T>` có sẵn vì backend trả thêm `totalItems` + items là union.)
 */
export interface StudentContributionPage {
  items: (Contribution | LegacyContributionItem)[];
  page: number;
  pageSize: number;
  total: number;
  totalItems: number;
  totalPages: number;
  legacySemesterAssignment?: string;
}


// ============================ CLUB REWARDS & COSMETICS (Phase 6) ============================
//
// Backend (AdminService/Endpoints/ClubCreditEndpoints.cs):
//   GET  /api/clubs/{clubId}/wallet/me       → ClubCreditWallet
//   GET  /api/clubs/{clubId}/rewards         → ClubRewardCatalogPage (chỉ PUBLISHED với user thường)
//   POST /api/clubs/{clubId}/rewards/{id}/redeem (Idempotency-Key bắt buộc;
//        body { expectedRewardVersion, expectedWalletVersion }; 409 STALE_WALLET /
//        REWARD_NOT_OPEN_OR_STALE / INSUFFICIENT_CREDIT → refetch)
//   GET  /api/users/me/cosmetics             → CosmeticInventoryPage (mục đã sở hữu)

/** Định nghĩa cosmetic do CLB cấp (ClubCosmeticDefinition). */
export interface CosmeticDefinitionDto {
  cosmeticId: string;
  issuerClubId: number;
  /** COLOR | SHAPE | FRAME | BUNDLE */
  kind: string;
  label: string;
  /**
   * COLOR → { background, secondary, accent, ink } (4 HEX);
   * SHAPE/FRAME → { assetUrl } (ảnh R2 do CLB upload).
   */
  definition: Record<string, unknown> | null;
}

/** Quà trong catalog CLB (ClubReward + grants + availability phái sinh). */
export interface ClubRewardItem {
  id: string;
  clubId: number;
  label: string;
  description: string;
  /** COLOR | SHAPE | FRAME | BUNDLE */
  kind: string;
  /** Giá tính bằng CLUB_CREDIT (= XP verified của CLB, 1-1). */
  price: number;
  /** PUBLISHED | DRAFT | RETIRED (user thường chỉ thấy PUBLISHED). */
  status: string;
  /** GUID — CAS khi redeem (expectedRewardVersion). */
  version: string;
  opensAt: string;
  closesAt: string | null;
  /** OPEN | SCHEDULED | EXPIRED (phái sinh từ status + cửa sổ thời gian). */
  availability: string;
  grants: CosmeticDefinitionDto[];
  /** "FULL_BUNDLE_PRICE_FOR_MISSING_GRANTS" */
  partialOwnershipPolicy: string;
  timezone: string;
}

export interface ClubRewardCatalogPage {
  clubId: number;
  asOf: string;
  capabilities: {
    canManage: boolean;
    canRedeem: boolean;
  };
  items: ClubRewardItem[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

/** Số dư credit CLB của user (CLUB_CREDIT, scope LIFETIME). */
export interface ClubCreditWallet {
  clubId: number;
  userId: number;
  unit: string;
  scope: string;
  policyVersion: string;
  earnedTotal: number;
  revokedTotal: number;
  spentTotal: number;
  /** Số credit khả dụng (có thể âm = nợ điểm). */
  balance: number;
  /** GUID — CAS khi redeem (expectedWalletVersion). */
  version: string;
  sourceRevision: string;
  hasDebt: boolean;
  /** "VERIFIED_CLUB_XP_1_TO_1" */
  conversion: string;
  experiencePointsAreNotSpent: boolean;
}

/** Biên lai redeem (ClubRewardRedemption) — trả về cả khi replay (idempotent). */
export interface ClubRewardRedemption {
  receiptId: string;
  userId: number;
  clubId: number;
  rewardId: string;
  rewardLabel: string;
  amount: number;
  /** cosmeticId đã cấp (bỏ trùng — chỉ grant CHƯA có). */
  grants: string[];
  balance: number;
  walletVersion: string;
  sourceRevision: string;
  policyVersion: string;
  createdAt: string;
  unit: string;
}

/** Kho cosmetic user đang sở hữu (mọi CLB). */
export interface CosmeticInventoryPage {
  userId: number;
  items: {
    cosmetic: CosmeticDefinitionDto;
    sourceReceiptId: string;
    acquiredAt: string;
  }[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}
