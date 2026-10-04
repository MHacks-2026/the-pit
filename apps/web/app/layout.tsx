import type { Metadata } from 'next';
import { Atkinson_Hyperlegible_Next, Big_Shoulders } from 'next/font/google';
import './globals.css';

// Big Shoulders was drawn for Chicago, home of the trading pits: it sets the wordmark, prices and numbers.
// Atkinson Hyperlegible Next carries everything else, readable from the back of a room.
const display = Big_Shoulders({ subsets: ['latin'], display: 'swap', axes: ['opsz'], variable: '--font-display' });
const text = Atkinson_Hyperlegible_Next({ subsets: ['latin'], display: 'swap', variable: '--font-text' });

export const metadata: Metadata = { title: 'THE PIT | Market Cop', description: 'A live play-money exchange with an AI Market Cop watching for cheats' };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" className={`${display.variable} ${text.variable}`}><body>{children}</body></html>;
}
