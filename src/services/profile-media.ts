// services/profile-media.ts
//
// Flow thay ảnh cá nhân / ảnh bìa (Phase 3) — đúng web `use-server-profile-images.js`:
//
//   1. createUploadIntent  → POST /api/media/upload-intents (intent + S3 signed URL)
//   2. putUploadFile       → PUT bytes thẳng lên signed URL (raw fetch, KHÔNG qua
//      gateway, KHÔNG Bearer — S3/R2 verify chữ ký)
//   3. saveProfileImage    → PATCH /api/users/me/profile với staging `publicUrl`
//      + header `Idempotency-Key` (bắt buộc ở BE). Server tự verify ảnh
//      (SelfProfileMediaVerifier) rồi move vào `verified/` và trả profile mới.
//      409 STALE_PROFILE → refetch version mới + retry 1 lần.
//
// LƯU Ý (rủi ro plan §Phase 3): gửi body bằng bytes đọc từ base64 của
// expo-image-picker (`base64: true`) thay vì `file://` URI — tránh vấn đề
// fetch không nhận file-URI trên RN/Hermes, nên KHÔNG cần expo-file-system.
// S3 presign GẮN Content-Type vào chữ ký ⇒ PUT bắt buộc kèm đúng header
// `Content-Type` khớp intent, nếu không R2 trả 403.

import { randomUUID } from 'expo-crypto';

import { ApiError, apiFetch } from '@/services/apiClient';
import { fetchSelfProfile } from '@/services/profile';
import type { SelfProfileResponse } from '@/types/api';

export type ProfileImageKind = 'avatar' | 'cover';

/** 5 MiB — khớp giới hạn backend (PublicMediaEndpoints). */
export const MAX_PROFILE_IMAGE_BYTES = 5 * 1024 * 1024;

const ALLOWED_TYPES: readonly string[] = ['image/png', 'image/jpeg', 'image/webp'];

/** Response POST /api/media/upload-intents */
export interface UploadIntent {
  uploadUrl: string;
  /** Staging public URL — chính URL này đưa vào PATCH profile. */
  publicUrl: string;
  key: string;
  expiresAt: string;
}

/**
 * Bước 1 — xin upload intent.
 * @param ownerId userId dạng string (AuthUser.id) — backend parse int.
 */
export async function createUploadIntent(
  kind: ProfileImageKind,
  ownerId: string,
  contentType: string,
  sizeBytes: number,
): Promise<UploadIntent> {
  if (!ALLOWED_TYPES.includes(contentType)) {
    throw new Error('Ảnh phải là PNG, JPEG hoặc WebP.');
  }
  if (sizeBytes <= 0 || sizeBytes > MAX_PROFILE_IMAGE_BYTES) {
    throw new Error(`Ảnh phải từ 1 byte tới ${Math.floor(MAX_PROFILE_IMAGE_BYTES / 1024 / 1024)} MB.`);
  }
  return apiFetch<UploadIntent>('/api/media/upload-intents', {
    method: 'POST',
    body: {
      kind: kind === 'avatar' ? 'student-avatar' : 'student-cover',
      ownerId,
      contentType,
      sizeBytes,
    },
  });
}

/**
 * Bước 2 — PUT bytes lên S3/R2 signed URL.
 * Phải kèm đúng `Content-Type` (đã bound vào chữ ký) và body là raw bytes.
 */
export async function putUploadFile(
  intent: UploadIntent,
  bytes: Uint8Array,
  contentType: string,
): Promise<void> {
  // bytes được sinh bằng `new Uint8Array(n)` (byteOffset = 0) ⇒ buffer khớp nguyên khối.
  const body = bytes.buffer as ArrayBuffer;
  const res = await fetch(intent.uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body,
  });
  if (!res.ok) {
    throw new Error(`Không tải ảnh lên được (HTTP ${res.status}). Vui lòng thử lại.`);
  }
}

/** 409 do version lệch (STALE_PROFILE / VERSION_CONFLICT / 409 thường). */
export function isVersionConflict(err: unknown): boolean {
  return (
    err instanceof ApiError &&
    (err.code === 'STALE_PROFILE' || err.code === 'VERSION_CONFLICT' || err.status === 409)
  );
}

export interface SaveProfileImageOptions {
  kind: ProfileImageKind;
  /** userId (dùng làm ownerId khi cần refetch). */
  userId: string;
  /** Staging `publicUrl` từ createUploadIntent (server verify + move sang verified/). */
  publicUrl: string;
  /** `version` hiện tại của profile (GET /api/users/me/profile). null → tự refetch. */
  version: string | null;
  /** null → bỏ qua gate client (server vẫn enforce whitelist). */
  editableFields: string[] | null;
}

/**
 * Bước 3 — PATCH /api/users/me/profile gắn ảnh.
 * Bắt buộc Idempotency-Key; 409 STALE_PROFILE → refetch + retry 1 lần (đúng web).
 * Trả về SelfProfileResponse MỚI (version mới, ảnh đã verify).
 */
export async function saveProfileImage(opts: SaveProfileImageOptions): Promise<SelfProfileResponse> {
  const field = opts.kind === 'avatar' ? 'profile.avatarUrl' : 'profile.coverImageUrl';
  if (opts.editableFields !== null && !opts.editableFields.includes(field)) {
    throw new Error('Máy chủ chưa cho phép lưu ảnh này. Hãy tải lại hồ sơ rồi thử lại.');
  }

  const profileBody =
    opts.kind === 'avatar' ? { avatarUrl: opts.publicUrl } : { coverImageUrl: opts.publicUrl };

  const attempt = (version: string) =>
    apiFetch<SelfProfileResponse>('/api/users/me/profile', {
      method: 'PATCH',
      body: { expectedVersion: version, profile: profileBody },
      headers: { 'Idempotency-Key': randomUUID() },
    });

  // Version đầu: lấy sẵn hoặc refetch (selfProfile lỗi trong feed → null).
  let version = opts.version;
  if (!version) {
    const fresh = await fetchSelfProfile();
    if (!fresh) throw new Error('Không tải được hồ sơ để lưu ảnh. Vui lòng thử lại.');
    version = fresh.version;
  }

  try {
    return await attempt(version);
  } catch (err) {
    if (!isVersionConflict(err)) throw err;
    // Hồ sơ đã bị ai đó sửa (vd web) → lấy version mới rồi retry MỘT lần.
    const fresh = await fetchSelfProfile();
    if (!fresh) throw err;
    if (!fresh.editableFields?.includes(field)) {
      throw new Error('Máy chủ chưa cho phép lưu ảnh này. Hãy tải lại hồ sơ rồi thử lại.');
    }
    return attempt(fresh.version);
  }
}

// ---------------------------------------------------------------------------
// Base64 → bytes (picker trả `base64: true`). Pure-TS, không phụ thuộc
// atob/Buffer (Hermes không có chuẩn, typing không nhất quán).
// ---------------------------------------------------------------------------

const B64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64_LOOKUP: Record<string, number> = {};
for (let i = 0; i < B64_CHARS.length; i++) B64_LOOKUP[B64_CHARS[i]] = i;
B64_LOOKUP['-'] = 62; // base64url (một số platform dùng dạng này)
B64_LOOKUP['_'] = 63;

export function base64ToUint8Array(base64: string): Uint8Array {
  const clean = base64.replace(/[\n\r\s]/g, '');
  const unpadded = clean.replace(/=+$/, '');
  const padCount = clean.length - unpadded.length;
  // 4 chars = 3 bytes; 2 chars (padding 1) = 2 bytes; 3 chars (padding 2) = 1 byte.
  const outLen = (unpadded.length * 3 - padCount) / 4;
  const out = new Uint8Array(outLen);

  let o = 0;
  for (let i = 0; i < unpadded.length; i += 4) {
    const a = B64_LOOKUP[unpadded[i]];
    const b = B64_LOOKUP[unpadded[i + 1]];
    // Nhóm cuối có thể thiếu c/d (do padding) — chỉ kiểm tra các byte thực ghi.
    const c = B64_LOOKUP[unpadded[i + 2]];
    const d = B64_LOOKUP[unpadded[i + 3]];
    if (a === undefined || b === undefined) {
      throw new Error('Dữ liệu ảnh không hợp lệ (base64). Hãy chọn lại ảnh.');
    }
    const n = (a << 18) | (b << 12) | ((c ?? 0) << 6) | (d ?? 0);
    out[o++] = (n >> 16) & 0xff;
    if (i + 2 < unpadded.length) {
      if (c === undefined) throw new Error('Dữ liệu ảnh không hợp lệ (base64).');
      out[o++] = (n >> 8) & 0xff;
    }
    if (i + 3 < unpadded.length) {
      if (d === undefined) throw new Error('Dữ liệu ảnh không hợp lệ (base64).');
      out[o++] = n & 0xff;
    }
  }
  return out;
}
