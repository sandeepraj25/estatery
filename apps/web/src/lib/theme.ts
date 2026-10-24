import type { ThemeTokens } from '@estatery/shared';

const FONT_STACKS = {
  manrope: "'Manrope Variable', 'Manrope', system-ui, sans-serif",
  inter: "'Inter Variable', 'Inter', system-ui, sans-serif",
  playfair: "'Playfair Display Variable', 'Playfair Display', Georgia, serif",
} as const;

/**
 * Converts a tenant's published theme into CSS custom properties on :root.
 * Values are validated hex colours / enums / integers (see themeTokensSchema), so this string is
 * safe to inline. Components only ever reference the variables, never raw colours.
 */
const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
const toHex = (c: number[]) => `#${c.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')}`;
function luminance(hex: string) {
  const [r, g, b] = rgb(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contrast(a: string, b: string) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p) as [number, number];
  return (x + 0.05) / (y + 0.05);
}
/**
 * Nudges a text colour toward black (on light backgrounds) or white (on dark ones) until it meets
 * the WCAG contrast target, keeping its hue. Agencies pick their colours; legibility is guaranteed.
 */
export function ensureContrast(fg: string, bg: string, target = 4.5) {
  if (contrast(fg, bg) >= target) return fg;
  const toward = luminance(bg) > 0.5 ? [0, 0, 0] : [255, 255, 255];
  const from = rgb(fg);
  for (let t = 0.04; t <= 1; t += 0.04) {
    const next = toHex(from.map((v, i) => v + (toward[i]! - v) * t));
    if (contrast(next, bg) >= target) return next;
  }
  return toHex(toward);
}

export function themeToCss(t: ThemeTokens): string {
  const c = {
    ...t.colors,
    textOnLight: ensureContrast(t.colors.textOnLight, t.colors.background, 7),
    // A margin above 4.5:1 keeps grey text readable on the slightly darker panels too.
    mutedOnLight: ensureContrast(t.colors.mutedOnLight, t.colors.background, 5),
    success: ensureContrast(t.colors.success, t.colors.background, 5.2),
    mutedOnDark: ensureContrast(t.colors.mutedOnDark, t.colors.primary, 4.5),
    textOnDark: ensureContrast(t.colors.textOnDark, t.colors.primary, 7),
  };
  const vars: Record<string, string> = {
    '--color-primary': c.primary,
    '--color-background': c.background,
    '--color-accent': c.accent,
    '--color-text': c.textOnLight,
    '--color-text-inverse': c.textOnDark,
    '--color-muted': c.mutedOnLight,
    '--color-muted-inverse': c.mutedOnDark,
    '--color-border': c.border,
    '--color-success': c.success,
    '--color-error': c.error,
    '--font-heading': FONT_STACKS[t.typography.heading],
    '--font-body': FONT_STACKS[t.typography.body],
    '--font-display': t.typography.editorialHeadlines ? FONT_STACKS.playfair : FONT_STACKS[t.typography.heading],
    '--display-weight': t.typography.editorialHeadlines ? '500' : '700',
    '--display-tracking': t.typography.editorialHeadlines ? '-0.015em' : '-0.035em',
    '--radius-card': `${t.shape.radiusCard}px`,
    '--radius-button': `${t.shape.radiusButton}px`,
    '--motion-scale': t.motion.level === 'full' ? '1' : t.motion.level === 'subtle' ? '0.5' : '0',
  };
  return `:root{${Object.entries(vars).map(([k, v]) => `${k}:${v}`).join(';')}}`;
}
