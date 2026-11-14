import { View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { colors } from '@/theme';
import { WORDMARK_ASPECT, WORDMARK_LETTERS, WORDMARK_VIEWBOX } from './generated';

/** "BGYM" with the orange B. */
export function Wordmark({ height, onDark = false }: { height: number; onDark?: boolean }) {
  const ink = onDark ? colors.white : colors.midnight;
  return (
    <View accessible accessibilityRole="image" accessibilityLabel="BGYM">
      <Svg width={height * WORDMARK_ASPECT} height={height} viewBox={WORDMARK_VIEWBOX}>
        {WORDMARK_LETTERS.map((l, i) => (
          <Path key={i} d={l.d} fill={l.accent ? colors.flare : ink} />
        ))}
      </Svg>
    </View>
  );
}
