// components/common/ListScreenLayout.tsx
import type { ReactNode } from 'react';
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import AppTopBar from './AppTopBar';

type Props = {
  /** Tiêu đề hiển thị giữa thanh trên cùng */
  title: string;
  /** Thường là một FlatList: nó tự cuộn nên khung này không bọc ScrollView */
  children: ReactNode;
};

/** Khung cho màn hình dạng danh sách dài (FlatList), thay cho ScreenLayout dùng ScrollView */
export default function ListScreenLayout({ title, children }: Props) {
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <AppTopBar title={title} />
      {children}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F9FAFB' },
});