// services/frameState.ts
//
// State khung avatar (Phase 6a) — lựa chọn equip LƯU DEVICE-LOCAL bằng
// expo-secure-store (cosmetics theo thiết kế là per-device, tương đương
// `clubhub:v2:profile:{userId}` của web). KHÔNG thêm dep AsyncStorage.
//
// Key: `clubhub:m:profile:{userId}`.
//
// Sở hữu (owned) là SERVER-BACKED (GET /api/users/me/cosmetics + catalog
// rewards, xem rewards.ts) — module này chỉ CHỨA "đã equip khung nào",
// còn "khung nào được phép equip" do ownership quyết định (khung rewards
// chỉ equip được khi đã sở hữu).
//
// ⚠️ Không import `expo-secure-store` top-level (crash khi `expo export:embed`
// evaluate trong Node) — dynamic import, chỉ chạy trên app thật (mirror session.ts).

import { getFrame } from '@/components/profile/avatarFrames';
import type { CosmeticInventoryPage } from '@/types/api';
import { ownedFrameLabels } from '@/services/rewards';

const keyFor = (userId: string) => `clubhub:m:profile:${userId}`;

export interface FrameState {
  /** frameId hiện equip ('none' = không dùng). */
  frame: string;
}

/** Đọc lựa chọn khung hiện tại của user (null nếu chưa từng chọn). */
export async function loadFrame(userId: string): Promise<FrameState | null> {
  try {
    const SecureStore = await import('expo-secure-store');
    const raw = await SecureStore.getItemAsync(keyFor(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as FrameState;
    if (typeof parsed?.frame !== 'string') return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Lưu lựa chọn khung. Chỉ lưu id HỢP LỆ trong catalog (id lạ → giữ
 * 'none', tránh lưu khung không tồn tại).
 */
export async function saveFrame(userId: string, frame: string): Promise<void> {
  const id = getFrame(frame) ? frame : 'none';
  try {
    const SecureStore = await import('expo-secure-store');
    await SecureStore.setItemAsync(keyFor(userId), JSON.stringify({ frame: id } satisfies FrameState));
  } catch {
    // Lỗi lưu (vd SecureStore bị khóa) — state trong bộ nhớ vẫn dùng được.
  }
}

/**
 * "Khung này được phép equip?" — free = luôn; rewards = phải sở hữu
 * (label match với cosmetic FRAME trong inventory). Không match → false.
 */
export function frameUnlocked(frameId: string, inventory: CosmeticInventoryPage | null): boolean {
  const frame = getFrame(frameId);
  if (!frame) return false;
  if (frame.free) return true;
  // Briedge bundled-id ↔ server-cosmetic theo nhãn (lowercase). Khung bundled
  // chỉ "mở" khi user sở hữu một cosmetic FRAME có cùng nhãn (mới nhất).
  const owned = ownedFrameLabels(inventory);
  return owned.has(frame.label.trim().toLowerCase());
}
