// components/event-detail/BottomActionBar.tsx
import { ArrowRight, MessageCircle } from 'lucide-react-native';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { RegisterState } from '@/types/activityDetail';

type Props = {
  register: RegisterState;
  onRegister: () => void;
  onCancel: () => void;
  onPressChat?: () => void;
};

export default function BottomActionBar({ register, onRegister, onCancel, onPressChat }: Props) {
  const insets = useSafeAreaInsets();
  const registeredAndCannotCancel = register.registered && !register.canCancel;
  const inactive = register.disabled || registeredAndCannotCancel;
  const cancelling = register.registered && register.canCancel && register.cancelling;
  const label = register.registered
    ? register.canCancel ? 'Hủy đăng ký' : 'Đã đăng ký'
    : 'Đăng ký tham gia ngay';

  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
      <Pressable style={styles.chat} onPress={onPressChat}>
        <MessageCircle size={20} color="#4B5563" />
      </Pressable>

      <Pressable
        style={[
          styles.button,
          register.registered && register.canCancel && styles.cancelButton,
          inactive && styles.buttonOff,
        ]}
        disabled={inactive || register.loading || cancelling}
        onPress={register.registered && register.canCancel ? onCancel : onRegister}>
        {register.loading || cancelling ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <>
            <Text style={styles.buttonText}>{label}</Text>
            {!register.registered && <ArrowRight size={18} color="#fff" />}
          </>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 12,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#EEF0F5',
  },
  chat: {
    width: 48,
    height: 52,
    borderRadius: 14,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  button: {
    flex: 1,
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: 14,
    backgroundColor: '#F97316',
  },
  /** Nền riêng cho nút "Hủy đăng ký" — phân biệt với hành vi hủy. */
  cancelButton: { backgroundColor: '#DC2626' },
  buttonOff: { backgroundColor: '#FDBA74' },
  buttonText: { color: '#fff', fontSize: 15, fontWeight: '800' },
});