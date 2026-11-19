// components/common/ScreenLayout.tsx
import type { ReactNode, RefObject } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import type { ScrollViewInstance } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import AppTopBar from './AppTopBar';

type Props = {
  /** Tiêu đề hiển thị giữa thanh trên cùng */
  title: string;
  children: ReactNode;
  /** Tuỳ chọn: ref của ScrollView để cha scroll tới một vị trí (vd đổi trang phân trang). */
  scrollRef?: RefObject<ScrollViewInstance | null>;
};

/** Khung chung cho các tab: SafeArea + thanh trên cùng + ScrollView + footer note */
export default function ScreenLayout({ title, children, scrollRef }: Props) {
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <AppTopBar title={title} />
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled">
        {children}
        {/* <Text style={styles.footerNote}>clubhub. – Một phần của hành trình FPTU Xperience</Text> */}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F9FAFB' },
  // chừa chỗ cho custom tab bar + nút nổi ở giữa
  content: { paddingBottom: 140 },
  footerNote: { textAlign: 'center', fontSize: 11, color: '#9CA3AF', marginTop: 28 },
});
