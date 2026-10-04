import type { Metadata } from 'next';
import { Barlow_Semi_Condensed, Special_Elite } from 'next/font/google';
import './globals.css';
import Backdrop from './Backdrop';

// Case-file look: Special Elite (typewriter) for titles and the Cop's words; Barlow Semi Condensed for everything else.
const type = Special_Elite({ subsets: ['latin'], weight: '400', display: 'swap', variable: '--font-type' });
const sans = Barlow_Semi_Condensed({ subsets: ['latin'], weight: ['400', '600', '700'], display: 'swap', variable: '--font-sans' });

export const metadata: Metadata = { title: 'THE PIT | Market Cop', description: 'A live play-money exchange with an AI Market Cop watching for cheats' };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" className={`${type.variable} ${sans.variable}`}><body><Backdrop />{children}</body></html>;
}
