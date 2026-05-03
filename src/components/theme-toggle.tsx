'use client';

import { Sun, Moon, Monitor, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useTheme, type Theme } from '@/components/theme-provider';

const ITEMS: Array<{ value: Theme; label: string; icon: React.ReactNode }> = [
  { value: 'light',  label: '라이트', icon: <Sun className="h-4 w-4" /> },
  { value: 'dark',   label: '다크',   icon: <Moon className="h-4 w-4" /> },
  { value: 'system', label: '시스템', icon: <Monitor className="h-4 w-4" /> },
];

/**
 * 테마 토글 버튼 (NFR-405).
 *  - 라이트/다크/시스템 3가지 선택
 *  - 헤더에 표시. 현재 모드에 따라 아이콘 변경.
 */
export function ThemeToggle() {
  const { theme, resolvedTheme, setTheme } = useTheme();

  const Icon = resolvedTheme === 'dark' ? Moon : Sun;

  return (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              aria-label={`테마 — 현재: ${resolvedTheme}`}
            >
              <Icon className="h-5 w-5" />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent>
          테마 ({theme === 'system' ? `시스템 — ${resolvedTheme}` : theme})
        </TooltipContent>
      </Tooltip>

      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuLabel className="text-xs">테마</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {ITEMS.map((item) => (
          <DropdownMenuItem
            key={item.value}
            onClick={() => setTheme(item.value)}
            className="justify-between"
          >
            <span className="inline-flex items-center gap-2">
              {item.icon}
              {item.label}
            </span>
            {theme === item.value && <Check className="h-3.5 w-3.5" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
