import type { Metadata } from 'next';
import './globals.css';
import { Toaster } from '@/components/ui/toaster';
import { ThemeProvider, themeInitScript } from '@/components/theme-provider';

export const metadata: Metadata = {
  title: 'PI Wiki — MES/APS PI 지식 허브',
  description: 'MES/APS PI 활동을 위한 위키 기반 지식 허브',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <head>
        {/*
          FOUC 방지 — hydration 전에 dark 클래스 결정.
          localStorage + prefers-color-scheme 모두 고려.
        */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-screen bg-background text-foreground antialiased">
        <ThemeProvider>
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
