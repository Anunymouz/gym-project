import { useId } from 'react';
import { View } from 'react-native';
import Svg, { Circle, G, Path } from 'react-native-svg';
import { colors } from '@/theme';
import { MARK_ASPECT, MARK_ORIGIN, MARK_VIEWBOX, MarkBells, MarkBody, ORBIT } from './generated';

/** Static BGYM mark: the athlete raising dumbbells inside a tilted orbit. */
export function Mark({ width, onDark = false }: { width: number; onDark?: boolean }) {
  const id = useId().replace(/:/g, '');
  const ink = onDark ? colors.white : colors.midnight;
  const rest = ORBIT.restAngle;
  return (
    <View accessible accessibilityRole="image" accessibilityLabel="BGYM logo">
      <Svg width={width} height={width / MARK_ASPECT} viewBox={MARK_VIEWBOX}>
        <G transform={MARK_ORIGIN}>
          <Path transform={ORBIT.transform} d={ORBIT.backD} fill="none" stroke={ink} strokeWidth={ORBIT.strokeWidth} strokeLinecap="round" />
          <MarkBells accent={colors.flare} />
          <MarkBody ink={ink} id={id} />
          <Path transform={ORBIT.transform} d={ORBIT.frontD} fill="none" stroke={ink} strokeWidth={ORBIT.strokeWidth} strokeLinecap="round" />
          <Circle
            transform={ORBIT.transform}
            cx={ORBIT.cx + ORBIT.rx * Math.cos(rest)}
            cy={ORBIT.cy + ORBIT.ry * Math.sin(rest)}
            r={ORBIT.dotR}
            fill={colors.flare}
          />
        </G>
      </Svg>
    </View>
  );
}
