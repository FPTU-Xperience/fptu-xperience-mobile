// services/googleDebug.ts
//
// Debug tạm cho Google Sign-In (One-Tap): ghi lại sự kiện (bấm login, response
// BE, kết quả One-Tap thủ công) để hiện trong DebugPopup trên màn login.
// Xóa file này + 2 hook nhỏ ở auth.ts + import ở login.tsx khi xong.
//
// Không dùng state trong component nào: module-level pub/sub +
// useSyncExternalStore ⇒ bất kỳ chỗ nào cũng ghi được, không cần prop drilling.

import { useSyncExternalStore } from 'react';

export type GoogleDebugEvent = {
  id: number;
  time: string; // HH:MM:SS
  level: 'info' | 'error' | 'success';
  message: string;
};

type Listener = () => void;

let events: GoogleDebugEvent[] = [];
let seq = 0;
const listeners = new Set<Listener>();

function emit() {
  for (const l of listeners) l();
}

/** Thêm 1 sự kiện (giới hạn 50 để tránh tràn). */
export function addGoogleDebugEvent(level: GoogleDebugEvent['level'], message: string): void {
  const time = new Date().toLocaleTimeString('vi-VN', { hour12: false });
  events = [{ id: ++seq, time, level, message }, ...events].slice(0, 50);
  // Đồng bộ ra logcat (adb logcat -s ReactNativeJS) để dev không cần nhìn app.
  if (level === 'error') console.warn(`[GoogleDebug] ${time} ${message}`);
  else console.log(`[GoogleDebug] ${time} ${message}`);
  emit();
}

export function clearGoogleDebugEvents(): void {
  events = [];
  emit();
}

// --- Hook (chỉ component dùng) ---
function subscribe(l: Listener): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

/** Snapshot ổn định (array mới chỉ khi có event thay đổi) — an toàn với useSyncExternalStore. */
export function useGoogleDebugEvents(): GoogleDebugEvent[] {
  return useSyncExternalStore(subscribe, () => events);
}
