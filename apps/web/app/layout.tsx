import type { Metadata } from 'next';
import { Geist } from 'next/font/google';
import './globals.css';
import './terminal.css';

const geist = Geist({ subsets: ['latin'], display: 'swap', variable: '--font-geist' });

export const metadata: Metadata = { title: 'THE PIT | Market Cop', description: 'A live play-money exchange with an AI Market Cop watching for cheats' };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" className={geist.variable}><body>
    {children}
  </body></html>;
}
