import type { Metadata } from 'next';
import './globals.css';
import { Toaster } from '@/components/ui/toaster';
import { ThemeProvider, themeInitScript } from '@/components/theme-provider';

export const metadata: Metadata = {
  title: 'Atlas — 사내 시스템 지식의 지도',
  description: 'MES·APS·ERP·CRM 등 사내 IT 시스템 문서를 한 곳에서 관리하는 위키',
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
