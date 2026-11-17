// components/common/AppTopBar.tsx
import { usePathname, useRouter } from 'expo-router';
import { Bell, ScanQrCode } from 'lucide-react-native';
import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/providers/AuthProvider';
import { fetchUnreadCount } from '@/services/notifications';
import { fetchSelfProfile } from '@/services/profile';
import logoUrl from '@/assets/fptux.png';

type Props = { title: string };

export default function AppTopBar({ title }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useAuth();
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;

    let cancelled = false;

    fetchSelfProfile()
      .then((profile) => {
        if (!cancelled) setAvatarUrl(profile?.profile.avatarUrl ?? null);
      })
      .catch(() => {
        if (!cancelled) setAvatarUrl(null);
      });

    return () => {
      cancelled = true;
    };
  }, [user]);

  // Số thông báo chưa đọc — badge chỉ hiện khi > 0 (trước đây là chấm cứng).
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    let cancelled = false;

    fetchUnreadCount()
      .then((count) => {
        if (!cancelled) setUnread(count);
      })
      .catch(() => {
        // Lỗi badge không được làm hỏng thanh trên cùng.
      });

    return () => {
      cancelled = true;
    };
  }, [pathname]);

  // Đang ở màn quét thì không cần nút quét nữa
  const showScan = pathname !== '/scan';

  return (
    <View style={styles.row}>
      <View style={styles.brand}>
        <Image source={logoUrl} style={styles.logo} contentFit="contain" />
        <Text style={styles.brandText}>
          Clubhub<Text style={styles.brandDot}>.</Text>
        </Text>
      </View>

      <Text style={styles.title}>{title}</Text>

      <View style={styles.right}>
        {showScan && (
          <Pressable
            style={styles.scan}
            onPress={() => router.navigate('/scan')}
            hitSlop={8}
            accessibilityLabel="Quét mã QR">
            <ScanQrCode size={20} color="#F97316" />
          </Pressable>
        )}

        <View>
          <Bell size={22} color="#374151" />
          {unread > 0 ? (
            unread > 99 ? (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>99+</Text>
              </View>
            ) : (
              <View style={styles.dot} />
            )
          ) : null}
        </View>

        <Pressable
          style={styles.avatar}
          onPress={() => router.navigate('/profile')}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel="Mở hồ sơ cá nhân">
          {avatarUrl ? (
            <Image
              source={{ uri: avatarUrl }}
              style={styles.avatarImage}
              contentFit="cover"
              transition={200}
            />
          ) : (
            <Text style={styles.avatarText}>{user?.initials ?? '--'}</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 },
  logo: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: '#fff',
  },
  brandText: { fontWeight: '800', fontSize: 26, color: '#111827', letterSpacing: -0.5 },
  brandDot: { color: '#F97316' },
  title: { fontWeight: '700', fontSize: 16, color: '#111827' },
  right: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 12,
  },
  scan: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FFF1E6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dot: {
    position: 'absolute',
    top: 0,
    right: 1,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#F97316',
    borderWidth: 1.5,
    borderColor: '#fff',
  },
  badge: {
    position: 'absolute',
    top: -4,
    right: -10,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    backgroundColor: '#F97316',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: '#fff', fontSize: 9.5, fontWeight: '800' },
  avatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#C2410C',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  avatarImage: { width: '100%', height: '100%' },
});