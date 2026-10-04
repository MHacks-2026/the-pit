import type { Metadata } from 'next';
import { Geist } from 'next/font/google';
import './globals.css';

const geist = Geist({ subsets: ['latin'], display: 'swap', variable: '--font-geist' });

export const metadata: Metadata = { title: 'THE PIT | Market Cop', description: 'A live play-money exchange with an AI Market Cop watching for cheats' };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" className={geist.variable}><body>
    <div className="bg-motion" aria-hidden="true"><i className="orb orb-a" /><i className="orb orb-b" /><i className="orb orb-c" /><i className="bg-grid" /></div>
    {children}
  </body></html>;
}
