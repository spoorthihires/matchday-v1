export function hexToRgb(hex: string): string {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `rgb(${r}, ${g}, ${b})`;
}

// Root design system (theme.css) — shared by the login screen and the admin console.
export const THEME = {
  indigo: hexToRgb('1e3a8a'),
  indigo600: hexToRgb('172c69'),
  indigo050: hexToRgb('f2f3f8'),
  indigo100: hexToRgb('e4e7f1'),
  gradientLight: hexToRgb('274ab0'),
  gradientDark: hexToRgb('10204b'),
};

// Scoped design system (employer.css, under .employer-app) — its own token set.
export const EMPLOYER_THEME = {
  indigo: hexToRgb('1e3a8a'),
  indigoD: hexToRgb('152552'),
  indigoDd: hexToRgb('0f1a37'),
  wash: hexToRgb('f2f3f8'),
  wash2: hexToRgb('f6f7fa'),
};

// The color the rebrand replaced — any surviving match is a regression.
export const LEGACY_INDIGO_HEX = ['#2f4fe0', '#2942c4', '#3554ea', '#20338f', '#5a74ee', '#c7d3ff', '#eef1fc', '#e0e6fb'];
export const LEGACY_INDIGO_RGB = 'rgb(47, 79, 224)';
