import { useMemo } from 'react';
import QRCode from 'qrcode';
import Svg, { Path, Rect } from 'react-native-svg';
import { colors } from '@/theme';

/** Renders a QR code as a single SVG path: crisp at any size, no images or native modules. */
export function QrCode({ value, size, color = colors.midnight }: { value: string; size: number; color?: string }) {
  const { path, count } = useMemo(() => {
    const qr = QRCode.create(value, { errorCorrectionLevel: 'M' });
    const n = qr.modules.size;
    let d = '';
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) if (qr.modules.get(x, y)) d += `M${x} ${y}h1v1h-1z`;
    }
    return { path: d, count: n };
  }, [value]);
  const quiet = 2;
  return (
    <Svg width={size} height={size} viewBox={`${-quiet} ${-quiet} ${count + quiet * 2} ${count + quiet * 2}`} accessibilityLabel="Membership QR code">
      <Rect x={-quiet} y={-quiet} width={count + quiet * 2} height={count + quiet * 2} fill={colors.white} />
      <Path d={path} fill={color} />
    </Svg>
  );
}
