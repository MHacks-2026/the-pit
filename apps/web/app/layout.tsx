import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = { title: 'THE PIT | Market Cop', description: 'Live play-money exchange alert feed' };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
