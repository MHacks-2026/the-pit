// Trading-floor badges. In the Chicago pits every trader wore a coloured jacket and a short ID badge; here every
// account gets the same: a 2-4 character code and a jacket colour. Bots keep fixed badges; players get theirs from
// their name, so the same person always looks the same on the tape, the leaderboard and the Cop desk.

export interface Badge { code: string; jacket: string; ink: string; isBot: boolean }

const BOT_BADGES: Record<string, { code: string; jacket: string }> = {
  'market-maker': { code: 'MKMK', jacket: '#2F6FED' },
  'noise-1': { code: 'NOI1', jacket: '#8B6CF0' },
  'noise-2': { code: 'NOI2', jacket: '#8B6CF0' },
  'noise-3': { code: 'NOI3', jacket: '#8B6CF0' },
  informed: { code: 'INFO', jacket: '#14A99A' },
  adaptive: { code: 'AI', jacket: '#E0479E' },
  spoofer: { code: 'SPOF', jacket: '#F08A24' },
};

// Jacket colours for players. Cop yellow, up green and down red are kept out on purpose.
const JACKETS = ['#2F6FED', '#8B6CF0', '#14A99A', '#E0479E', '#F08A24', '#38BDF8', '#B4643C', '#7C8BA1'];

const FLOOR = '#14171C';
const CHALK = '#FFFFFF';

function luminance(hex: string): number {
  const channel = (i: number) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Dark or white text, whichever reads better on the jacket colour. */
export function inkFor(jacket: string): string {
  return contrast(jacket, CHALK) >= contrast(jacket, FLOOR) ? CHALK : FLOOR;
}

/** Floor code from a display name: initials for several words, otherwise the first four letters. */
export function badgeCode(name: string): string {
  const words = name.toUpperCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  if (!words.length) return '?';
  if (words.length > 1) return words.map(w => w[0]).join('').slice(0, 4);
  return [...words[0]].slice(0, 4).join('');
}

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function badgeFor(name: string, isBot: boolean): Badge {
  const known = isBot ? BOT_BADGES[name] : undefined;
  const code = known?.code ?? badgeCode(name);
  const jacket = known?.jacket ?? JACKETS[hash(name) % JACKETS.length];
  return { code, jacket, ink: inkFor(jacket), isBot };
}
