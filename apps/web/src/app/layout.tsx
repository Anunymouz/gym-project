import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import { sidebarBootScript } from '@/lib/sidebar';
import './globals.css';

// Self-hosted Outfit (SIL OFL): no third-party font requests, works with a strict CSP.
const outfit = localFont({
  src: [
    { path: './fonts/outfit-latin-400-normal.woff2', weight: '400', style: 'normal' },
    { path: './fonts/outfit-latin-500-normal.woff2', weight: '500', style: 'normal' },
    { path: './fonts/outfit-latin-600-normal.woff2', weight: '600', style: 'normal' },
    { path: './fonts/outfit-latin-700-normal.woff2', weight: '700', style: 'normal' },
    { path: './fonts/outfit-latin-800-normal.woff2', weight: '800', style: 'normal' },
  ],
  variable: '--font-outfit',
  display: 'swap',
});

export const metadata: Metadata = {
  title: { default: 'BGYM for business', template: '%s · BGYM' },
  description: 'Dashboards for BGYM gyms, trainers, store partners and the BGYM team.',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: '#0D1028',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    // The boot script may set data-sidebar before React loads, hence suppressHydrationWarning.
    <html lang="en-GH" className={`${outfit.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: sidebarBootScript }} />
      </head>
      <body className="min-h-full font-sans">{children}</body>
    </html>
  );
}
