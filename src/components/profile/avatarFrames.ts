// components/profile/avatarFrames.ts
//
// Catalog khung avatar (Phase 6a) — mirror web `AVATAR_FRAMES`
// (fptu-xperience-clubhub-ui/src/pages/v2/profile-page/avatar-frames.js).
//
// 2 khung free (always dùng được) + 3 khung FPT-DEV (rewards — phải "sở hữu"
// từ kho cosmetics / đổi tại kho quà CLB mới equip được). Khung vẽ bằng
// react-native-svg (overlay lên avatar), KHÔNG phải ảnh nên không cần asset.
//
// "Sở hữu" (owned) được tính server-backed: free = luôn; khung rewards = có
// mặt trong `GET /api/users/me/cosmetics` (ClubCosmeticOwnership). Không còn
// dùng kho quà localStorage 200-point mock của web (bỏ hẳn theo plan).

export type FramePattern = 'ring' | 'circuit' | 'orbit' | 'pixel';

export interface FrameItem {
  id: string;
  label: string;
  /** Khung free — luôn equip được, không cần sở hữu. */
  free: boolean;
  /** Màu vòng chính (primary). `none` không có màu (ẩn overlay). */
  color?: string;
  /** Màu vòng phụ (secondary). */
  accent?: string;
  /** Kiểu họa tiết overlay. */
  pattern?: FramePattern;
  /** Giá (CLUB_CREDIT) — chỉ có nghĩa với khung rewards. */
  cost?: number;
  clubCode?: string;
  clubName?: string;
}

export const AVATAR_FRAMES: FrameItem[] = [
  { id: 'none', label: 'Không dùng khung', free: true },
  { id: 'orange', label: 'Cam trải nghiệm', free: true, color: '#f97316', accent: '#fed7aa', pattern: 'ring' },
  {
    id: 'fpt-dev-circuit-frame',
    label: 'Circuit Green',
    free: false,
    cost: 80,
    clubCode: 'FPT-DEV',
    clubName: 'FPT Dev',
    color: '#15803d',
    accent: '#86efac',
    pattern: 'circuit',
  },
  {
    id: 'fpt-dev-orbit-frame',
    label: 'Developer Orbit',
    free: false,
    cost: 100,
    clubCode: 'FPT-DEV',
    clubName: 'FPT Dev',
    color: '#6366f1',
    accent: '#c4b5fd',
    pattern: 'orbit',
  },
  {
    id: 'fpt-dev-pixel-frame',
    label: 'Pixel Hacker',
    free: false,
    cost: 120,
    clubCode: 'FPT-DEV',
    clubName: 'FPT Dev',
    color: '#65a30d',
    accent: '#bef264',
    pattern: 'pixel',
  },
];

/** Khung rewards (không free) — danh sách "khóa" cho đến khi sở hữu. */
export const AVATAR_FRAME_REWARDS: FrameItem[] = AVATAR_FRAMES.filter((f) => !f.free);

export function getFrame(id: string): FrameItem | undefined {
  return AVATAR_FRAMES.find((f) => f.id === id);
}
