'use client';

import * as React from 'react';

export type Theme = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

interface ThemeContextValue {
  theme: Theme;             // 사용자가 고른 모드 (system 포함)
  resolvedTheme: ResolvedTheme; // 실제 적용 중인 모드
  setTheme: (t: Theme) => void;
}

const ThemeContext = React.createContext<ThemeContextValue | null>(null);

const STORAGE_KEY = 'pi-wiki:theme';
const COOKIE_KEY = 'pi-wiki-theme';

/* -------------------------------------------------------------- */
/*  FOUC 방지 inline script                                         */
/*    - <head> 안에서 hydration 전에 dark 클래스 결정/적용              */
/*    - dangerouslySetInnerHTML 로 root layout 에서 주입                */
/* -------------------------------------------------------------- */
export const themeInitScript = `(function(){try{
  var s = localStorage.getItem('${STORAGE_KEY}');
  var sys = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  var dark = s === 'dark' || ((s === null || s === 'system') && sys);
  if (dark) document.documentElement.classList.add('dark');
  else document.documentElement.classList.remove('dark');
}catch(e){}})();`;

function readSystem(): ResolvedTheme {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function readStored(): Theme {
  if (typeof window === 'undefined') return 'system';
  const v = window.localStorage.getItem(STORAGE_KEY);
  if (v === 'light' || v === 'dark' || v === 'system') return v;
  return 'system';
}

function applyTheme(t: Theme): ResolvedTheme {
  const resolved: ResolvedTheme = t === 'system' ? readSystem() : t;
  const root = document.documentElement;
  if (resolved === 'dark') root.classList.add('dark');
  else root.classList.remove('dark');
  return resolved;
}

function persist(t: Theme) {
  try {
    window.localStorage.setItem(STORAGE_KEY, t);
    // 쿠키는 SSR 에서 읽을 수 있도록 1년 보존
    document.cookie = `${COOKIE_KEY}=${t}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax`;
  } catch {
    // ignore
  }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = React.useState<Theme>('system');
  const [resolvedTheme, setResolved] = React.useState<ResolvedTheme>('light');

  // 1) 마운트 시 저장된 테마 + 적용
  React.useEffect(() => {
    const stored = readStored();
    setThemeState(stored);
    setResolved(applyTheme(stored));
  }, []);

  // 2) system 모드일 때 시스템 변경 감지
  React.useEffect(() => {
    if (theme !== 'system' || typeof window === 'undefined') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => setResolved(applyTheme('system'));
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [theme]);

  const setTheme = React.useCallback((t: Theme) => {
    setThemeState(t);
    setResolved(applyTheme(t));
    persist(t);
  }, []);

  const value = React.useMemo(
    () => ({ theme, resolvedTheme, setTheme }),
    [theme, resolvedTheme, setTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = React.useContext(ThemeContext);
  if (!ctx) {
    // 프로바이더 밖에서 호출되는 경우 안전 fallback
    return {
      theme: 'system',
      resolvedTheme: 'light',
      setTheme: () => undefined,
    };
  }
  return ctx;
}
