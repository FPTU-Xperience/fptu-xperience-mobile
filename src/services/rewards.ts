// services/rewards.ts
//
// Kho quà CLB (Phase 6b) — nguồn server-backed, bỏ hẳn localStorage mock của web.
//
// Backend (AdminService/Endpoints/ClubCreditEndpoints.cs):
//   GET  /api/users/me/cosmetics                 → CosmeticInventoryPage
//   GET  /api/clubs/{clubId}/wallet/me           → ClubCreditWallet (CLUB_CREDIT = XP verified 1-1)
//   GET  /api/clubs/{clubId}/rewards             → ClubRewardCatalogPage (user thường chỉ thấy PUBLISHED)
//   POST /api/clubs/{clubId}/rewards/{id}/redeem (Idempotency-Key bắt buộc;
//        body { expectedRewardVersion, expectedWalletVersion }; CAS: 409 STALE_WALLET /
//        REWARD_NOT_OPEN_OR_STALE; thiếu điểm: 409 INSUFFICIENT_CREDIT)
//
// Redeem IDEMPOTENT: user đã đổi reward → backend trả lại receipt cũ (200),
// không trừ điểm lần 2. 409 STALE_* → refetch wallet + reward rồi retry MỘT lần
// (mirror Phase 4). INSUFFICIENT_CREDIT KHÔNG retry (refetch cũng thiếu).

import { randomUUID } from 'expo-crypto';

import { ApiError, apiFetch, toQuery } from '@/services/apiClient';
import type {
  ClubCreditWallet,
  ClubRewardCatalogPage,
  ClubRewardItem,
  ClubRewardRedemption,
  CosmeticInventoryPage,
} from '@/types/api';

/** Kho cosmetic user đang sở hữu (mọi CLB, phân trang default 100). */
export async function fetchMyCosmetics(): Promise<CosmeticInventoryPage> {
  const data = await apiFetch<CosmeticInventoryPage>(
    `/api/users/me/cosmetics${toQuery({ page: 1, pageSize: 100 })}`,
  );
  return data ?? { userId: 0, items: [], page: 1, pageSize: 100, totalItems: 0, totalPages: 0 };
}

/** Số dư CLUB_CREDIT của user trong một CLB. */
export async function fetchClubWallet(clubId: number): Promise<ClubCreditWallet> {
  return apiFetch<ClubCreditWallet>(`/api/clubs/${clubId}/wallet/me`);
}

/** Catalog quà PUBLISHED của CLB (user thường). */
export async function fetchClubRewards(
  clubId: number,
  params: { page?: number; pageSize?: number } = {},
): Promise<ClubRewardCatalogPage> {
  const query = toQuery({ page: params.page ?? 1, pageSize: params.pageSize ?? 20 });
  return apiFetch<ClubRewardCatalogPage>(`/api/clubs/${clubId}/rewards${query}`);
}

export interface RedeemRewardInput {
  clubId: number;
  reward: ClubRewardItem;
  /** GUID version hiện tại của wallet (từ fetchClubWallet) — CAS. */
  walletVersion: string;
}

/**
 * Đổi quà: POST /api/clubs/{clubId}/rewards/{rewardId}/redeem.
 * Trả biên lai (receipt) — kể cả replay (đã đổi trước đó, idempotent).
 */
export async function redeemReward(input: RedeemRewardInput): Promise<ClubRewardRedemption> {
  const { clubId, reward, walletVersion } = input;

  const attempt = (rewardVersion: string, wVersion: string) =>
    apiFetch<ClubRewardRedemption>(`/api/clubs/${clubId}/rewards/${reward.id}/redeem`, {
      method: 'POST',
      body: {
        expectedRewardVersion: rewardVersion,
        expectedWalletVersion: wVersion,
      },
      headers: { 'Idempotency-Key': randomUUID() },
    });

  try {
    return await attempt(reward.version, walletVersion);
  } catch (err) {
    // Thiếu điểm → KHÔNG retry (refetch cũng vẫn thiếu) — thông điệp rõ.
    if (err instanceof ApiError && err.code === 'INSUFFICIENT_CREDIT') {
      throw new Error(
        `Chưa đủ điểm CLB để đổi "${reward.label}" (giá ${reward.price} điểm).`,
      );
    }
    // 409 STALE_WALLET / REWARD_NOT_OPEN_OR_STALE → refetch version, retry MỘT lần.
    if (err instanceof ApiError && err.status === 409) {
      const [freshWallet, freshRewards] = await Promise.all([
        fetchClubWallet(clubId),
        fetchClubRewards(clubId),
      ]);
      const fresh = freshRewards.items.find((r) => r.id === reward.id);
      if (!fresh) throw new Error('Phần quà không còn khả dụng. Vui lòng tải lại.');
      return attempt(fresh.version, freshWallet.version);
    }
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Ownership (Phase 6a/6b):
//  - Khung bundled (avatarFrames.ts) "được mở" khi user sở hữu cosmetic
//    FRAME tương ứng — server (ClubCosmeticOwnership) là source of truth.
//  - Bridge bundled-id ↔ server-cosmetic: theo NHÃN (lowercase), vì server
//    cosmetic chỉ có GUID ổn định + label người đọc được; label là điểm giao
//    duy nhất client biết trước. Không match → khung giữ khóa (trung thực).
//  - Bỏ hẳn kho quà localStorage 200-point mock của web (theo plan).
// ---------------------------------------------------------------------------

/** Nhãn (lowercase) các cosmetic FRAME user đang sở hữu. */
export function ownedFrameLabels(inventory: CosmeticInventoryPage | null): Set<string> {
  const set = new Set<string>();
  for (const item of inventory?.items ?? []) {
    if (item.cosmetic.kind === 'FRAME') {
      set.add(item.cosmetic.label.trim().toLowerCase());
    }
  }
  return set;
}

/** Một reward: user đã sở hữu TẤT CẢ grant (cosmeticId) chưa? (server truth). */
export function rewardFullyOwned(
  reward: ClubRewardItem,
  inventory: CosmeticInventoryPage | null,
): boolean {
  if (!reward.grants.length) return false;
  const ownedIds = new Set((inventory?.items ?? []).map((i) => i.cosmetic.cosmeticId));
  return reward.grants.every((g) => ownedIds.has(g.cosmeticId));
}

/** Nhãn các grant (cosmetic) của reward — hiển thị trong sheet kho quà. */
export function grantLabels(reward: ClubRewardItem): string {
  if (!reward.grants.length) return '—';
  return reward.grants.map((g) => g.label).join(' + ');
}
