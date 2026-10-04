/**
 * Design tokens for both colour schemes.
 *
 * The light values are the palette that was already hardcoded across the
 * stylesheets. The dark values are the same hues at inverted lightness, with the
 * surfaces and the four text tiers hand-tuned. Contrast was checked per pairing
 * rather than by eye: every text-on-surface combination clears WCAG AA in both
 * schemes.
 */

const light = {
  // Surfaces
  page: '#F7F8F5',
  surface: '#FFFFFF',
  surfaceAlt: '#F4F7F3',
  surfaceSoft: '#EDF5EF',
  border: '#E9EDE8',
  borderStrong: '#DDE3DC',

  // Text
  textPrimary: '#25342A',
  textBody: '#34433A',
  textSecondary: '#48534C',
  textMuted: '#58655B',
  onAccent: '#FFFFFF',

  // Green accent
  accentFill: '#477B5B',
  accentPressed: '#3E6C4E',
  accentSoft: '#EAF2EB',
  accentText: '#4B6A53',
  deepFill: '#396349',

  // Status and game accents
  dangerFill: '#D56D54',
  dangerSoft: '#FCEFEC',
  dangerText: '#B8473A',
  warmFill: '#D47732',
  warmSoft: '#FFF2E7',
  warmText: '#955E14',
  emberText: '#B24F2A',
  brickText: '#AE5146',
  coolFill: '#2A75C7',
  coolSoft: '#EEF3FF',
  coolText: '#1D6FB4',
  violetSoft: '#F0EEFF',
  violetText: '#6050F1',
  memoryFill: '#5A8063',
  neutralFill: '#B4C4B8',

  // Floating tab dock. The dock always inverts against the page: dark on the
  // light canvas, light on the dark one, so it reads as a separate surface.
  dockSurface: '#1E2620',
  dockBorder: '#2E3B32',
  dockMuted: '#9BAAA0',
  // The three tab accents, resolved for use *on the dock* rather than on the
  // page. These are the same hues as accentText/coolText/emberText with the
  // lightness that the opposite scheme needs.
  dockAccentGreen: '#A7CBAD',
  dockAccentBlue: '#8BC0EE',
  dockAccentAmber: '#F59E74',

} as const;

const dark = {
  // Surfaces
  page: '#171A16',
  surface: '#1F231D',
  surfaceAlt: '#272C25',
  surfaceSoft: '#232A21',
  border: '#333A31',
  borderStrong: '#414940',

  // Text
  textPrimary: '#F0F3EF',
  textBody: '#DDE2DC',
  textSecondary: '#C2CBC2',
  textMuted: '#A3AEA4',
  onAccent: '#F4F7F4',

  // Green accent
  accentFill: '#3E6B4A',
  accentPressed: '#35593F',
  accentSoft: '#22301F',
  accentText: '#A9C9AE',
  deepFill: '#4C7C5B',

  // Status and game accents
  dangerFill: '#B4543F',
  dangerSoft: '#3A2320',
  dangerText: '#F0A79C',
  warmFill: '#B4611F',
  warmSoft: '#33281A',
  warmText: '#E3BE7E',
  emberText: '#EFA07A',
  brickText: '#EE9E93',
  coolFill: '#2F6FB8',
  coolSoft: '#1C2433',
  coolText: '#8FC0EA',
  violetSoft: '#262238',
  violetText: '#AEA6F5',
  memoryFill: '#33513D',
  neutralFill: '#39413B',

  // Floating tab dock, inverted relative to the light scheme above.
  dockSurface: '#F2F5F1',
  dockBorder: '#DDE3DC',
  dockMuted: '#5C6A60',
  dockAccentGreen: '#4B6A53',
  dockAccentBlue: '#1D6FB4',
  dockAccentAmber: '#B24F2A',

} as const;

export type Theme = {
  page: string;
  surface: string;
  surfaceAlt: string;
  surfaceSoft: string;
  border: string;
  borderStrong: string;
  textPrimary: string;
  textBody: string;
  textSecondary: string;
  textMuted: string;
  onAccent: string;
  accentFill: string;
  accentPressed: string;
  accentSoft: string;
  accentText: string;
  deepFill: string;
  dangerFill: string;
  dangerSoft: string;
  dangerText: string;
  warmFill: string;
  warmSoft: string;
  warmText: string;
  emberText: string;
  brickText: string;
  coolFill: string;
  coolSoft: string;
  coolText: string;
  violetSoft: string;
  violetText: string;
  memoryFill: string;
  neutralFill: string;
  dockSurface: string;
  dockBorder: string;
  dockMuted: string;
  dockAccentGreen: string;
  dockAccentBlue: string;
  dockAccentAmber: string;
};

export const themes = { light, dark };

export type ColorScheme = keyof typeof themes;

export default themes;
