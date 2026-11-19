// services/googleAuth.ts
//
// Google Sign-In native qua `react-native-nitro-google-signin`
// (docs Expo "Google authentication" recommend lib này cho Android vì hỗ trợ
//  Android Credential Manager; provider Google của `expo-auth-session` đã deprecated).
//
// ⚠️ QUAN TRỌNG — không import lib ở top-level:
// `react-native-nitro-google-signin/src/GoogleOneTapSignIn.ts` gọi
// `NitroModules.createHybridObject()` ngay ở module scope. Nếu file này được
// require trong môi trường không có native runtime (ví dụ `expo export:embed`
// khi build — Expo Router evaluate bundle trong Node để sinh server manifest),
// nó sẽ gọi native module và crash với:
//   "Invariant Violation: __fbBatchedBridgeConfig is not set, cannot invoke native modules"
// ⇒ Ta import ĐỘNG (dynamic import) trong hàm, chỉ chạy trên app thật.
//
// API (đọc từ source package):
//   GoogleOneTapSignIn.configure({ webClientId, iosClientId?, offlineAccess?, hostedDomain? })
//   GoogleOneTapSignIn.signIn() → { data: { user, idToken, serverAuthCode, scopes } }
//
// QUAN TRỌNG — audience:
//   `webClientId` PHẢI là **Web OAuth client ID** (dạng *.apps.googleusercontent.com),
//   và đó chính là `GOOGLE_CLIENT_ID` mà BE dùng để validate `aud` của ID token.
//   Source của lib ghi rõ: truyền *Android* client ID vào `webClientId` → DEVELOPER_ERROR.
//   ⇒ Token trả về có `aud` = Web client ID ⇒ khớp BE ⇒ **BE không cần đổi**.
//   Android OAuth client (package name + SHA-1) chỉ dùng để định danh app cho Google.
//
// Yêu cầu build: development build / standalone APK (native code — không chạy được Expo Go).

import type { OneTapResponse } from 'react-native-nitro-google-signin';
import { addGoogleDebugEvent } from '@/services/googleDebug';

type NitroGoogleSignInModule = typeof import('react-native-nitro-google-signin');

let libPromise: Promise<NitroGoogleSignInModule> | null = null;

/** Load lib native lazily (chỉ resolve được trong app runtime). */
async function loadLib(): Promise<NitroGoogleSignInModule> {
  libPromise ??= import('react-native-nitro-google-signin');
  return libPromise;
}

export class GoogleSignInFailure extends Error {
  readonly code: string;
  constructor(message: string, code: string) {
    super(message);
    this.name = 'GoogleSignInFailure';
    this.code = code;
  }
}

/**
 * Đăng nhập Google và trả ID token (JWT) để gửi lên
 * `POST /api/auth/google { credential }`.
 */
export async function promptGoogleSignIn(): Promise<string> {
  const webClientId = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID;
  if (!webClientId) {
    throw new GoogleSignInFailure(
      'Thiếu EXPO_PUBLIC_GOOGLE_CLIENT_ID. Điền Web client ID của Google (cùng giá trị BE dùng cho GOOGLE_CLIENT_ID) rồi build lại app.',
      'NO_CLIENT_ID',
    );
  }

  const { GoogleOneTapSignIn, isCancelledResponse, isErrorWithCode, isSuccessResponse, statusCodes } =
    await loadLib();

  // Cấu hình 1 lần (idempotent).
  GoogleOneTapSignIn.configure({
    webClientId,
    offlineAccess: false,
    hostedDomain: null,
  });

  let response: OneTapResponse;
  try {
    response = await GoogleOneTapSignIn.signIn();
    // DEBUG: ghi type response (success | noSavedCredentialFound | cancelled)
    // để DebugPopup phân biệt One-Tap im lặng vs success mà thiếu token.
    addGoogleDebugEvent('info', `One-Tap response: type=${response.type}${response.data ? `, user=${response.data.user.email ?? response.data.user.id}` : ''}`);
  } catch (e) {
    if (isErrorWithCode(e)) {
      if (e.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
        throw new GoogleSignInFailure(
          'Thiết bị chưa có Google Play Services hoặc đang quá cũ. Vui lòng cập nhật rồi thử lại.',
          e.code,
        );
      }
      if (e.code === statusCodes.DEVELOPER_ERROR) {
        throw new GoogleSignInFailure(
          'Cấu hình Google Sign-In sai (package name / SHA-1 / client ID). Kiểm tra lại phần cấu hình Google Cloud.',
          e.code,
        );
      }
      throw new GoogleSignInFailure(e.message, e.code);
    }
    throw new GoogleSignInFailure(
      e instanceof Error && e.message ? e.message : 'Đăng nhập Google thất bại.',
      'UNKNOWN',
    );
  }

  if (isCancelledResponse(response)) {
    throw new GoogleSignInFailure('Bạn đã hủy đăng nhập Google.', statusCodes.SIGN_IN_CANCELLED);
  }

  // Credential Manager "One Tap" chỉ SILENT khi máy NAY có sẵn credential đã
  // lưu cho app (đăng nhập Google 1 lần trước đó). Lần đầu / máy chưa lưu
  // → type='noSavedCredentialFound' (KHÔNG phải lỗi) → phải mở UI CHỌN
  // TÀI KHOẢN RÕ (explicit) qua presentExplicitSignIn(). Không xử lý bước
  // này → user bấm Google → "không hiện gì" → quay lại login (lỗi bạn gặp).
  if (!isSuccessResponse(response)) {
    addGoogleDebugEvent('info', 'One-Tap im lặng (noSavedCredentialFound) → mở UI chọn tài khoản (explicit)');
    let explicit: OneTapResponse;
    try {
      explicit = await GoogleOneTapSignIn.presentExplicitSignIn();
      addGoogleDebugEvent('info', `Explicit sign-in response: type=${explicit.type}${explicit.data ? `, user=${explicit.data.user.email ?? explicit.data.user.id}` : ''}`);
    } catch (e) {
      if (isErrorWithCode(e)) {
        throw new GoogleSignInFailure(e.message, e.code);
      }
      throw new GoogleSignInFailure(
        e instanceof Error && e.message ? e.message : 'Đăng nhập Google thất bại.',
        'UNKNOWN',
      );
    }
    if (isCancelledResponse(explicit)) {
      throw new GoogleSignInFailure('Bạn đã hủy đăng nhập Google.', statusCodes.SIGN_IN_CANCELLED);
    }
    if (!isSuccessResponse(explicit)) {
      // Explicit trả noSavedCredentialFound = user không chọn tài khoản nào
      // (đóng UI) → coi như cancel, không phải "Google không trả token".
      throw new GoogleSignInFailure('Không chọn được tài khoản Google.', 'NO_ACCOUNT_SELECTED');
    }
    return explicit.data.idToken;
  }
  return response.data.idToken;
}
