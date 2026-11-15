// components/profile/AvatarFrameOverlay.tsx
//
// Overlay khung avatar (Phase 6a) — mirror web `ProfileAvatar.jsx`:
// vẽ bằng react-native-svg (viewBox 120x120), đặt CHỒNG LÊN ảnh/initials,
// không che ảnh (rỗng giữa). 4 kiểu họa tiết: ring / circuit / orbit / pixel.
//
// `none` → không render gì. Dùng cho ProfileHero (88px) + preview modal.

import Svg, { Circle, G, Path, Rect } from 'react-native-svg';

import { type FrameItem } from './avatarFrames';

type Props = {
  frame: FrameItem | null;
  /** Cạnh ngoài cùng (px) của overlay — phải khớp kích thước avatar (kèm viền). */
  size: number;
};

export default function AvatarFrameOverlay({ frame, size }: Props) {
  if (!frame || frame.id === 'none' || !frame.color) return null;

  const primary = frame.color;
  const secondary = frame.accent ?? primary;
  const pattern = frame.pattern ?? 'ring';

  // viewBox 120x120 (khớp web) — scale theo size thật.
  return (
    <Svg width={size} height={size} viewBox="0 0 120 120">
      <Circle
        cx="60"
        cy="60"
        r="55"
        fill="none"
        stroke={primary}
        strokeWidth={6}
        strokeDasharray={pattern === 'pixel' ? '9 4' : undefined}
      />
      <Circle cx="60" cy="60" r="50" fill="none" stroke={secondary} strokeWidth={2} />

      {pattern === 'circuit' &&
        [0, 90, 180, 270].map((angle) => (
          <G key={angle} transform={`rotate(${angle} 60 60)`}>
            <Path d="M60 3v12h8" fill="none" stroke={secondary} strokeWidth={3} />
            <Circle cx="68" cy="15" r="3" fill={primary} />
          </G>
        ))}

      {pattern === 'orbit' && (
        <G fill={secondary} stroke={primary} strokeWidth={2}>
          <Circle cx="22" cy="20" r="7" />
          <Circle cx="102" cy="91" r="6" />
        </G>
      )}

      {pattern === 'pixel' && (
        <G fill={secondary} stroke={primary} strokeWidth={2}>
          <Rect x="17" y="13" width="12" height="12" />
          <Rect x="91" y="95" width="12" height="12" />
        </G>
      )}
    </Svg>
  );
}
