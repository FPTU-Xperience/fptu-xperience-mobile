# Plan — Profile tab mobile: data thật thay mock + port tính năng `/v2/profile` (web)

## Context

Màn **Profile** của app mobile (`fptux-mobile`, Expo SDK 58) hiện render từ `src/services/mockProfile.ts` (data "Mai An" tĩnh). Mục tiêu:

1. **Thay toàn bộ mock bằng API thật** (gateway `https://clubreporthub.duckdns.org`).
2. **Port tính năng của trang `/v2/profile` trên web** (`fptu-xperience-clubhub-ui`): hiển thị hồ sơ thật, **thay ảnh cá nhân / ảnh bìa (kèm khung)**, và **chỉnh sửa profile 3 tab** (Giới thiệu / Cá nhân / Học vụ).
3. **Quyết định của user** (đã hỏi & chốt):
   - **Port cả hệ rewards** — dùng endpoint server thật (thay thế kho quà device-local kiểu web của `cover-cosmetics.js`).
   - **Nối tab Minh chứng** với `GET /api/users/me/contributions`.
   - **Bỏ** nút "Xem view công khai".

Hạ tầng mobile đã có sẵn, không làm lại: `apiClient.ts` (Bearer + auto-refresh + error table tiếng Việt, đã map sẵn `STALE_PROFILE`), hook `useApiState` (pattern data-fetching của mọi tab khác — chỉ profile còn dùng useState), đã cài `expo-image` / `react-native-svg` / `expo-camera` / `expo-secure-store` (chưa có AsyncStorage → dùng SecureStore). Types `SelfProfileResponse`, `Contribution`, `Paged<T>` có sẵn trong `src/types/api.ts`.

### Backend đã sẵn sàng (đã verify trực tiếp trong C#)
- **`GET /api/users/me/profile`** → `{ userId, version (GUID string), profile{displayName,about,skills[],interests[],headline,avatarUrl,coverImageUrl}, personal{phoneNumber,dateOfBirth,address}, academic{major,majorAvailability}, editableFields[] }` — endpoint: `AuthService/Endpoints/CanonicalProfileEndpoints.cs`.
- **`PATCH /api/users/me/profile`** body `{ expectedVersion (Guid), profile?, personal?, academic?, onboarding? }`. Whitelist profile: `displayName (≤120), about (≤2000), skills/interests (≤30 items ≤100 ký tự), headline (≤160), avatarUrl, coverImageUrl`; personal: `phoneNumber (≤20, [0-9+ ()-]), dateOfBirth (yyyy-MM-dd, không tương lai), address (≤300)`; academic: chỉ `major` (phải nằm trong allowed list). `409 STALE_PROFILE` khi version lệch (đã map sẵn trong apiClient). **Cosmetics (khung/màu/shape) KHÔNG nằm trên server** → lưu device-local.
- **Danh sách major cho phép** hard-code trong backend `StudentOnboardingRules.Majors` (9 giá trị: Kỹ thuật phần mềm, Trí tuệ nhân tạo, An toàn thông tin, Thiết kế mỹ thuật số, Truyền thông đa phương tiện, Kinh doanh quốc tế, Digital Marketing, Ngôn ngữ Anh, Ngôn ngữ Nhật) — `AuthService/Endpoints/StudentOnboardingRules.cs`. **Không có endpoint** lộ danh sách → mobile dùng hằng số tĩnh mirror.
- **`POST /api/media/upload-intents`** `{ kind:'student-avatar'|'student-cover', ownerId, contentType, sizeBytes }` → `{ uploadUrl (S3 signed), publicUrl, key, expiresAt }` → client PUT file lên `uploadUrl` → PATCH `profile.avatarUrl/coverImageUrl`. Giới hạn PNG/JPEG/WebP ≤ 5 MiB.
- **`GET /api/users/me/contributions`** (paged) — `AdminService/Endpoints/VerifiedContributionEndpoints.cs`; trả `StudentContributionPage` của `ContributionResponse` (title, message, occurredAt, status, rawPoints, clubId/activityId).
- **Rewards (đã implement, migration 20261104)** — `AdminService/Endpoints/ClubCreditEndpoints.cs`:
  - `GET /api/clubs/{clubId}/wallet/me` → `{ balance, version, ... }`
  - `GET /api/clubs/{clubId}/rewards` (paged; caller không-manager chỉ thấy `PUBLISHED`; item có `availability` + `grants[]` với `definition`: COLOR = palette 4-HEX, SHAPE/FRAME/BUNDLE = `assetUrl`)
  - `POST /api/clubs/{clubId}/rewards/{id}/redeem` `{ expectedRewardVersion, expectedWalletVersion }` (idempotent, debit + ownership atomic)
  - `GET /api/users/me/cosmetics` (paged ownership)
  - Asset club-published: chỉ **PNG/JPEG/WebP** (R2), không nhận SVG.

## Các phase (làm tuần tự; mỗi phase demo được + typecheck/lint sạch)

### Phase 1 — Data thật cho màn Profile (thay mock)
- Extend `SelfProfileResponse` trong `src/types/api.ts`: thêm `editableFields: string[]`, `personal.dateOfBirth`, `personal.address`, `academic.majorAvailability` (đúng shape backend).
- `src/services/profile.ts`: thêm `fetchSelfProfile()`; ghép vào `fetchProfile()` bằng `Promise.all`, bắt lỗi riêng (selfProfile lỗi → vẫn hiện được phần cơ bản, như radar/summary). Lấp `user.name/bio/major/cohort` từ self-profile thay các hằng `UNKNOWN`/hardcode; `skills[]` thật; `clubs[]` từ `GET /api/clubs/me/memberships` (filter `APPROVED` — pattern đã có sẵn trong `services/myClubs.ts:38-84`, reuse `classify`); bỏ `plan: 'Pro'` hardcode.
- `src/app/(tabs)/profile.tsx`: đổi từ `useState`+`useEffect`+spinner sang `useApiState(fetchProfile, [])` + `ErrorState`/`EmptyState`/retry — đúng pattern đang dùng ở các tab khác (vd `activity.tsx:64`).
- **Xóa** `src/services/mockProfile.ts`.
- **Accept:** màn hiện đúng tên/điểm/radar/skills/CLB của account dev; kill mạng → ErrorState + retry chạy được; không còn import mock nào.

### Phase 2 — Hiện ảnh thật (avatar + bìa)
- `src/components/profile/ProfileHero.tsx`: dùng `expo-image` (đã cài) render `avatarUrl` (fallback initials-circle khi null) và `coverImageUrl` làm nền cover (fallback màu + `coverText`). Props `onChangeAvatar`/`onChangeCover`/`onEdit` hiện no-op — sẽ được nối ở Phase 3/4.
- Extend `src/types/profile.ts`: thêm `avatarUrl`, `coverImageUrl` vào `ProfileUser`.
- Không thêm phụ thuộc mới.

### Phase 3 — Thay ảnh (upload flow) + image picker
- `npx expo install expo-image-picker` (theo AGENTS.md — luôn dùng `npx expo install`).
- `src/services/profile-media.ts` (mới):
  - `uploadProfileImage(kind, uri, mimeType, sizeBytes)` → `POST /api/media/upload-intents` → `fetch PUT` file lên `uploadUrl` (verify cách gửi body từ local file URI trên SDK 58; fallback đọc `ArrayBuffer` qua `expo-file-system` nếu fetch không nhận `file://`).
  - `saveProfileImage(field, publicUrl, version)` → `PATCH /api/users/me/profile` `{ expectedVersion, profile:{ avatarUrl|coverImageUrl } }` + header `Idempotency-Key`; xử lý `409 STALE_PROFILE` → refetch profile rồi retry 1 lần; **chỉ gọi khi `editableFields` chứa field đó** (giống web `use-server-profile-images.js`).
  - UI: modal chọn Ảnh (camera/thư viện qua `expo-image-picker`) → preview → nút "Lưu" (đẩy upload + PATCH, hiện progress).
- **Accept:** đổi avatar/bìa thật → thấy ngay trên hero → đồng bộ sang web (cùng endpoint D02).

### Phase 4 — Màn chỉnh sửa profile (3 tab)
- Route mới `src/app/(tabs)/profile/edit.tsx` (Expo Router cho phép file `profile.tsx` + thư mục `profile/` song song; chỉ conflict nếu tồn tại `profile/index.tsx` — hiện không có; nếu build lỗi → chuyển route phẳng `profile-edit.tsx`). Route con thừa hưởng auth guard từ `<Stack.Screen name="(tabs)"/>` trong `_layout.tsx`, không cần đăng ký thêm.
- `src/components/profile/ProfileEditForm.tsx` (mới): 3 tab mirror web `EditProfileModal.jsx`:
  - **Giới thiệu:** `displayName` (required, ≤120), `headline` (≤160), `about` (≤2000), `skills`/`interests` (text → array; ≤30 mục ≤100 ký tự/mục theo backend).
  - **Cá nhân:** `dateOfBirth` (yyyy-MM-dd, không quá hôm nay), `phoneNumber` (≤20, `[0-9+ ()-]`), `address` (≤300).
  - **Học vụ:** `major` **chỉnh được** (select từ danh sách 9 giá trị tĩnh, mirror `StudentOnboardingRules.Majors`) — khác web (web read-only vì có CTSV sync; mobile không có nguồn đó, backend đã hỗ trợ). Các trường còn lại (campus/cohort/studentCode) read-only + nhãn "Chỉ đọc từ tài khoản học vụ".
  - Chỉ cho sửa field có trong `editableFields`; trường còn lại disabled + ghi chú "Chỉ đọc".
- Flow (đúng web): draft in-memory → "Xem trước" validate client (giới hạn như trên) → thanh "Lưu thay đổi" → `patchSelfProfile()` (mới, trong `services/profile.ts`, build wire `{ expectedVersion, profile?, personal?, academic? }` + Idempotency-Key) → thành công: refetch feed + dismiss; lỗi: hiện error, giữ draft.
- Nút "Chỉnh sửa" trên hero (`ProfileHero`) link tới route này.
- **Accept:** sửa 3 tab + lưu → dữ liệu đồng bộ web; sửa field không trong `editableFields` → UI chặn + nhãn chỉ đọc.

### Phase 5 — Tab Minh chứng thật
- `services/profile.ts`: `fetchContributions(page)` → map `Contribution` → `Evidence` (title, `occurredAt`→date, thêm `status`/`rawPoints`/`clubId`).
- `src/components/profile/EvidenceTab.tsx`: danh sách thật, chip trạng thái (Đã duyệt / Chờ duyệt), load-more theo `totalPages`; empty state hiện có giữ nguyên.

### Phase 6 — Khung ảnh + hệ rewards (server-backed)
Chia 2 bước nhỏ:
- **6a — Khung (cosmetics equip):**
  - Port catalog: 2 khung free (`none`, `orange`) + 3 khung FPT-DEV (`circuit`/`orbit`/`pixel` — vector định nghĩa trong code, overlay bằng `react-native-svg` lên avatar). **MVP: khung avatar trước**; cover design (màu/shape/chữ) là extension sau.
  - Sở hữu từ `GET /api/users/me/cosmetics` + catalog `GET /api/clubs/{clubId}/rewards` (grants + availability). **Bỏ hẳn** kho quà localStorage 200-point mock của web.
  - Lưu lựa chọn đã equip: key `clubhub:m:profile:{userId}` (equivalent `clubhub:v2:profile:{userId}` của web) bằng `expo-secure-store` (đã cài; cosmetics là device-local theo thiết kế) — không thêm dep AsyncStorage.
  - UI: tab "Khung" trong modal avatar — chọn / khóa / khám thử + banner "Đổi tại Kho quà CLB" link sang 6b.
- **6b — Kho quà (rewards):**
  - `src/services/rewards.ts` (mới): `fetchClubRewards(clubId)`, `fetchClubWallet(clubId)`, `redeemReward(clubId, rewardId, {expectedRewardVersion, expectedWalletVersion})` (idempotent, `409 → refetch`), `fetchMyCosmetics()`.
  - UI sheet "Kho quà": số dư (`wallet.balance`), danh sách quà (kèm `assetUrl` R2 cho shape/frame), nút Đổi → redeem → cập nhật owned.
  - Asset club-published: chỉ PNG/JPEG/WebP (R2); 3 SVG combo FPT-DEV bundled thì copy sang `assets/` mobile nếu cần.
- **Accept:** đổi khung → thấy overlay; redeem từ wallet thật → khung mở khóa; không còn số liệu mock nào trong chuỗi rewards.

### Phase 7 — Nghiệm thu + dọn dẹp
- `npx expo lint` + `npx tsc --noEmit` (quy tắc repo: chạy trước khi báo xong).
- Xoá mọi import mock còn sót; cập nhật `MOCK_TO_API_PLAN.md` (đánh dấu profile xong).
- Chạy tay: login thật (Google/email) + dev token; đối chiếu màn mobile với web `/v2/profile` trên cùng account.

## Rủi ro / điểm cần verify khi code
- **RN PUT file lên S3 presigned URL** (Phase 3): presigned thường cho phép, nhưng cách gửi body từ `file://` URI trên SDK 58 phải verify trên máy thật trước khi viết UI; fallback qua `expo-file-system` đọc `ArrayBuffer`.
- **Expo Router** `profile.tsx` + `profile/edit.tsx`: verify build; fallback route phẳng nếu conflict.
- **`editableFields`** chưa khai báo trong DTO mobile hiện tại — phải extend (Phase 1) trước khi dùng ở Phase 3/4.
- **Major allowed-list**: backend không có endpoint; dùng hằng số tĩnh mirror 9 giá trị (Phase 4). Nếu backend sau này đổi danh sách, mobile phải đồng bộ thủ công.

## File chính
- `src/app/(tabs)/profile.tsx` (sửa), `src/app/(tabs)/profile/edit.tsx` (mới)
- `src/components/profile/ProfileHero.tsx`, `EvidenceTab.tsx`, `ClubsCard.tsx` (sửa); `ProfileEditForm.tsx`, `AvatarFramePicker.tsx` (mới)
- `src/services/profile.ts` (mở rộng), `profile-media.ts` (mới), `rewards.ts` (mới); `mockProfile.ts` (xóa)
- `src/types/api.ts` (extend `SelfProfileResponse`), `src/types/profile.ts` (extend `Evidence`/`ProfileUser`)
