import type { ThemeTokens } from './site.js';

/**
 * Theme presets. "Forest & Champagne" is the platform default; the admin panel's
 * "Reset to default" and preset picker read from here.
 */
export const THEME_PRESETS: Record<string, { label: string; tokens: ThemeTokens }> = {
  'forest-champagne': {
    label: 'Forest & Champagne',
    tokens: {
      colors: {
        primary: '#10251D',
        background: '#F5F2EA',
        accent: '#C6A66B',
        textOnLight: '#202720',
        textOnDark: '#FFFFFF',
        mutedOnLight: '#737970',
        mutedOnDark: '#A8B2AA',
        border: '#DCDDD4',
        success: '#28764A',
        error: '#B42318',
      },
      typography: { heading: 'manrope', body: 'inter', editorialHeadlines: true },
      shape: { radiusCard: 18, radiusButton: 999 },
      motion: { level: 'full' },
    },
  },
  'midnight-terracotta': {
    label: 'Midnight & Terracotta',
    tokens: {
      colors: {
        primary: '#141B2D',
        background: '#F6F1EB',
        accent: '#C9774F',
        textOnLight: '#1D2230',
        textOnDark: '#FFFFFF',
        mutedOnLight: '#6E7180',
        mutedOnDark: '#A7ADBF',
        border: '#E0DAD2',
        success: '#28764A',
        error: '#B42318',
      },
      typography: { heading: 'manrope', body: 'inter', editorialHeadlines: false },
      shape: { radiusCard: 10, radiusButton: 8 },
      motion: { level: 'subtle' },
    },
  },
};

export const DEFAULT_THEME_PRESET = 'forest-champagne';
