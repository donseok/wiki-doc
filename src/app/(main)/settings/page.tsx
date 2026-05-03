'use client';
import { useEffect, useState } from 'react';
import { Sun, Moon, Monitor } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from '@/components/ui/use-toast';
import { ExportButton } from '@/components/admin/export-button';
import { useTheme, type Theme } from '@/components/theme-provider';

export default function SettingsPage() {
  const [user, setUser] = useState('');
  const { theme, resolvedTheme, setTheme } = useTheme();

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setUser(localStorage.getItem('pi-wiki:user') || '');
  }, []);

  const saveUser = () => {
    const name = user.trim() || '익명';
    localStorage.setItem('pi-wiki:user', name);
    document.cookie = `pi-wiki-user=${encodeURIComponent(name)}; path=/; max-age=${60 * 60 * 24 * 365}`;
    toast({ title: '설정 저장', description: `사용자: ${name} (새로고침 후 반영)` });
  };

  const themeButtons: Array<{ value: Theme; label: string; icon: React.ReactNode }> = [
    { value: 'light',  label: '라이트', icon: <Sun className="h-4 w-4" /> },
    { value: 'dark',   label: '다크',   icon: <Moon className="h-4 w-4" /> },
    { value: 'system', label: '시스템', icon: <Monitor className="h-4 w-4" /> },
  ];

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <h1 className="text-2xl font-bold">설정</h1>

      <section className="space-y-3 rounded-lg border bg-card p-4">
        <h2 className="font-semibold">사용자 정보</h2>
        <p className="text-xs text-muted-foreground">
          1차 오픈에서는 인증이 적용되지 않습니다 (NFR-303).
          입력하신 이름이 작성자/멘션/Edit Lock 보유자로 사용됩니다.
        </p>
        <div className="space-y-1.5">
          <Label htmlFor="user">사용자 이름</Label>
          <Input
            id="user"
            value={user}
            onChange={(e) => setUser(e.target.value)}
            placeholder="홍길동"
            onKeyDown={(e) => {
              if (e.key === 'Enter') saveUser();
            }}
          />
        </div>
        <Button size="sm" onClick={saveUser}>
          사용자 정보 저장
        </Button>
      </section>

      <section className="space-y-3 rounded-lg border bg-card p-4">
        <h2 className="font-semibold">테마 (NFR-405)</h2>
        <p className="text-xs text-muted-foreground">
          현재 적용 중: <strong>{resolvedTheme === 'dark' ? '다크' : '라이트'}</strong>
          {theme === 'system' && ' (시스템 설정 자동 추적)'}
        </p>
        <div className="flex flex-wrap gap-2">
          {themeButtons.map((b) => (
            <Button
              key={b.value}
              variant={theme === b.value ? 'default' : 'outline'}
              size="sm"
              onClick={() => setTheme(b.value)}
              className="gap-1.5"
            >
              {b.icon}
              {b.label}
            </Button>
          ))}
        </div>
        <p className="pt-1 text-xs text-muted-foreground">
          헤더 우측의 테마 버튼으로도 즉시 전환 가능합니다.
        </p>
      </section>

      <section className="space-y-3 rounded-lg border bg-card p-4">
        <h2 className="font-semibold">관리자 도구</h2>
        <p className="text-xs text-muted-foreground">
          태그 관리(FR-805), 일괄 백업/내보내기(NFR-204), 감사 로그(NFR-304) 등 운영 도구는
          별도 관리자 페이지에서 다룹니다. 사용자 정의 템플릿(FR-212)도 별도 페이지에서 관리합니다.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="default" size="sm">
            <a href="/admin">관리자 페이지로 이동</a>
          </Button>
          <Button asChild variant="outline" size="sm">
            <a href="/templates">템플릿 관리 (FR-212)</a>
          </Button>
        </div>
        <p className="pt-2 text-xs text-muted-foreground">
          아래는 외부 AI 도구(Claude Code/Cursor/ChatGPT)로 즉시 전달 가능한 AI 친화 JSON
          내보내기 (FR-1009) 입니다.
        </p>
        <div className="flex gap-2">
          <ExportButton />
        </div>
      </section>
    </div>
  );
}
