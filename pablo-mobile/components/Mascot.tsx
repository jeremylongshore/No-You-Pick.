import React from 'react';
import Svg, { Circle, Ellipse, Path, G } from 'react-native-svg';

export type Expression = 'happy' | 'thinking' | 'sad' | 'surprised';

interface Props {
  expression?: Expression;
  size?: number;
}

/** Foxie — the app's mascot. Ported from the web app's inline SVG. */
export const Mascot: React.FC<Props> = ({ expression = 'happy', size = 120 }) => {
  const eye = (cx: number) => {
    switch (expression) {
      case 'thinking':
        return <Path d={`M${cx - 5} 46 h10`} stroke="#1a1a2e" strokeWidth={2.5} strokeLinecap="round" />;
      case 'sad':
        return <Path d={`M${cx - 5} 48 q5 -5 10 0`} stroke="#1a1a2e" strokeWidth={2.5} strokeLinecap="round" fill="none" />;
      case 'surprised':
        return <Circle cx={cx} cy={46} r={5} fill="#1a1a2e" />;
      default:
        return <Circle cx={cx} cy={46} r={3.5} fill="#1a1a2e" />;
    }
  };

  const mouth = () => {
    switch (expression) {
      case 'sad':
        return <Path d="M52 64 q8 -6 16 0" stroke="#1a1a2e" strokeWidth={2.5} strokeLinecap="round" fill="none" />;
      case 'surprised':
        return <Ellipse cx={60} cy={63} rx={5} ry={6} fill="#1a1a2e" />;
      case 'thinking':
        return <Path d="M54 63 h12" stroke="#1a1a2e" strokeWidth={2.5} strokeLinecap="round" />;
      default:
        return <Path d="M52 60 q8 8 16 0" stroke="#1a1a2e" strokeWidth={2.5} strokeLinecap="round" fill="none" />;
    }
  };

  return (
    <Svg width={size} height={size} viewBox="0 0 120 110">
      <G>
        {/* ears */}
        <Path d="M26 34 L20 8 L46 24 Z" fill="#e94560" />
        <Path d="M94 34 L100 8 L74 24 Z" fill="#e94560" />
        <Path d="M29 31 L26 16 L41 25 Z" fill="#ffd6de" />
        <Path d="M91 31 L94 16 L79 25 Z" fill="#ffd6de" />
        {/* head */}
        <Ellipse cx={60} cy={50} rx={36} ry={32} fill="#f47c54" />
        {/* snout */}
        <Ellipse cx={60} cy={60} rx={20} ry={16} fill="#fff4ec" />
        {eye(46)}
        {eye(74)}
        {/* nose */}
        <Ellipse cx={60} cy={53} rx={4.5} ry={3.5} fill="#1a1a2e" />
        {mouth()}
        {/* cheeks */}
        <Circle cx={34} cy={58} r={5} fill="#e94560" opacity={0.28} />
        <Circle cx={86} cy={58} r={5} fill="#e94560" opacity={0.28} />
      </G>
    </Svg>
  );
};
