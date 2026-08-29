// Fixed dark palette for career-mode hub screens — deliberately NOT tied to
// system light/dark mode. Broadcast-graphics data-dense aesthetic, original
// colour values (CLAUDE.md design brief: take the structure/density freely,
// keep the palette our own — pitch green, not FIFA blue).
export const CareerTheme = {
  background: '#0A0D12',
  surface: '#141922',
  surfaceRaised: '#1B212C',
  border: '#242B38',
  accent: '#3DDC84',
  accentMuted: 'rgba(61, 220, 132, 0.14)',
  accentText: '#04140B',
  text: '#F5F7FA',
  textSecondary: '#8A93A6',
  textMuted: '#5B6376',
} as const;
