import { useEffect, useState } from 'react';
import { useColorScheme as useRNColorScheme } from 'react-native';

/**
 * To support static rendering, this value needs to be re-calculated on the client side for web
 */
export function useColorScheme() {
  const [hasHydrated, setHasHydrated] = useState(false);

  // Gate hydration chủ đích: render tĩnh (SSG/SSR) không đọc được scheme thật
  // (window.matchMedia) → trả 'light' cố định, sau mount mới dùng giá trị thật.
  // Đây là pattern mount-gate chuẩn; rule react-hooks/set-state-in-effect
  // (React Compiler) không nhận ra → scoped-disable.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHasHydrated(true);
  }, []);

  const colorScheme = useRNColorScheme();

  if (hasHydrated) {
    return colorScheme;
  }

  return 'light';
}
