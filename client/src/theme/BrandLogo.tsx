import { useTheme } from './ThemeContext.js';

// logo.png's blue is baked into the raster; logo-dark.png is the same asset with
// only that blue recolored to white (see scripts run to generate it) so it reads
// against the dark navy chrome instead of disappearing into it.
export function BrandLogo({ className }: { className?: string }) {
  const { theme } = useTheme();
  return <img src={theme === 'dark' ? '/logo-dark.png' : '/logo.png'} alt="MatchDay" className={className} />;
}
