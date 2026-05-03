/**
 * 사용자 정의 템플릿 관리 — FR-212 / FR-213
 *
 * - 좌측: 시스템 / 사용자 템플릿 그룹 + 카테고리 필터
 * - 우측: 선택된 템플릿 편집 폼 (시스템은 읽기 전용)
 * - 본문에서 {{var}} 패턴을 자동 추출해 변수 목록을 표시 (FR-213)
 * - 미리보기: applyTemplateVariables 로 변수 치환 후 MarkdownView 렌더
 */

'use client';

import { useEffect, useMemo, useState } from 'react';
import { Plus, Trash2, FileText, Save, Lock, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { toast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';
import { MarkdownView } from '@/components/page/markdown-view';
import {
  applyTemplateVariables,
  listTemplateVariables,
} from '@/lib/templates';
import type { TemplateData } from '@/types';

const ALL_CATEGORY = '__all__';
const NO_CATEGORY = '__none__';

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<TemplateData[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [filterCategory, setFilterCategory] = useState<string>(ALL_CATEGORY);

  // 편집 폼 상태
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [icon, setIcon] = useState('');
  const [contentMarkdown, setContentMarkdown] = useState('');
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  const selected = useMemo(
    () => templates.find((t) => t.id === selectedId) ?? null,
    [templates, selectedId],
  );

  const isReadOnly = selected?.isSystem ?? false;

  // 카테고리 distinct
  const categories = useMemo(() => {
    const set = new Set<string>();
    templates.forEach((t) => {
      if (t.category && t.category.trim()) set.add(t.category);
    });
    return Array.from(set).sort();
  }, [templates]);

  // 변수 추출
  const variables = useMemo(
    () => listTemplateVariables(contentMarkdown),
    [contentMarkdown],
  );

  // 미리보기 (변수 치환된 마크다운)
  const previewSource = useMemo(
    () => applyTemplateVariables(contentMarkdown, { title: name || '제목 없음' }),
    [contentMarkdown, name],
  );

  // 목록 로드
  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/templates', { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || '로드 실패');
      const list = json.data as TemplateData[];
      setTemplates(list);
      if (list.length > 0 && !selectedId) {
        // 사용자 템플릿이 있으면 첫 사용자, 아니면 첫 시스템
        const firstUser = list.find((t) => !t.isSystem);
        setSelectedId((firstUser ?? list[0]).id);
      }
    } catch (e) {
      toast({
        title: '템플릿 로드 실패',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 선택 변경 시 폼 동기화
  useEffect(() => {
    if (!selected) {
      setName('');
      setDescription('');
      setCategory('');
      setIcon('');
      setContentMarkdown('');
      setDirty(false);
      return;
    }
    setName(selected.name);
    setDescription(selected.description ?? '');
    setCategory(selected.category ?? '');
    setIcon(selected.icon ?? '');
    setContentMarkdown(selected.contentMarkdown ?? '');
    setDirty(false);
  }, [selectedId, selected]);

  const filtered = useMemo(() => {
    if (filterCategory === ALL_CATEGORY) return templates;
    if (filterCategory === NO_CATEGORY) return templates.filter((t) => !t.category);
    return templates.filter((t) => t.category === filterCategory);
  }, [templates, filterCategory]);

  const systemTemplates = filtered.filter((t) => t.isSystem);
  const userTemplates = filtered.filter((t) => !t.isSystem);

  // 새 템플릿 생성
  const createNew = async () => {
    if (dirty && !confirm('편집 중인 변경사항이 있습니다. 새 템플릿을 만드시겠습니까?')) {
      return;
    }
    try {
      const res = await fetch('/api/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: '새 템플릿',
          description: '',
          category: '',
          contentMarkdown: '# {{title}}\n\n작성일: {{date}}\n작성자: {{author}}\n\n',
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || '생성 실패');
      const created = json.data as TemplateData;
      await load();
      setSelectedId(created.id);
      toast({ title: '새 템플릿 생성', description: created.name });
    } catch (e) {
      toast({
        title: '생성 실패',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      });
    }
  };

  // 저장
  const save = async () => {
    if (!selected || isReadOnly) return;
    if (!name.trim()) {
      toast({ title: '이름을 입력하세요', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/templates/${selected.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
          category: category.trim() || null,
          icon: icon.trim() || null,
          contentMarkdown,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || '저장 실패');
      toast({ title: '저장 완료', description: name });
      setDirty(false);
      await load();
    } catch (e) {
      toast({
        title: '저장 실패',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!selected || isReadOnly) return;
    if (!confirm(`'${selected.name}' 템플릿을 삭제하시겠습니까?`)) return;
    try {
      const res = await fetch(`/api/templates/${selected.id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || '삭제 실패');
      toast({ title: '삭제 완료', description: selected.name });
      setSelectedId(null);
      await load();
    } catch (e) {
      toast({
        title: '삭제 실패',
        description: e instanceof Error ? e.message : String(e),
        variant: 'destructive',
      });
    }
  };

  const onFieldChange = <T,>(setter: (v: T) => void) => (v: T) => {
    setter(v);
    setDirty(true);
  };

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col">
      {/* 헤더 */}
      <div className="flex items-center justify-between border-b bg-card px-6 py-3">
        <div>
          <h1 className="text-xl font-bold">템플릿 관리</h1>
          <p className="text-xs text-muted-foreground">
            FR-212 사용자 정의 템플릿 · FR-213 변수 치환 ({'{{date}}'}, {'{{author}}'}, {'{{title}}'})
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={cn('mr-1.5 h-4 w-4', loading && 'animate-spin')} />
            새로고침
          </Button>
          <Button size="sm" onClick={createNew}>
            <Plus className="mr-1.5 h-4 w-4" />
            새 템플릿
          </Button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* 좌측: 목록 */}
        <aside className="flex w-72 flex-col border-r bg-muted/30">
          {/* 카테고리 필터 */}
          <div className="border-b p-3">
            <Label className="text-xs">카테고리 필터</Label>
            <select
              className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm shadow-sm"
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
            >
              <option value={ALL_CATEGORY}>전체</option>
              <option value={NO_CATEGORY}>(분류 없음)</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <ScrollArea className="flex-1">
            <div className="p-2">
              {systemTemplates.length > 0 && (
                <div className="mb-3">
                  <div className="px-2 py-1 text-xs font-semibold uppercase text-muted-foreground">
                    시스템
                  </div>
                  <ul className="space-y-0.5">
                    {systemTemplates.map((t) => (
                      <TemplateListItem
                        key={t.id}
                        tpl={t}
                        active={selectedId === t.id}
                        onClick={() => setSelectedId(t.id)}
                      />
                    ))}
                  </ul>
                </div>
              )}

              <div>
                <div className="px-2 py-1 text-xs font-semibold uppercase text-muted-foreground">
                  사용자 ({userTemplates.length})
                </div>
                {userTemplates.length === 0 ? (
                  <p className="px-2 py-3 text-xs text-muted-foreground">
                    아직 사용자 정의 템플릿이 없습니다. 우상단 [+ 새 템플릿] 으로 만들 수 있습니다.
                  </p>
                ) : (
                  <ul className="space-y-0.5">
                    {userTemplates.map((t) => (
                      <TemplateListItem
                        key={t.id}
                        tpl={t}
                        active={selectedId === t.id}
                        onClick={() => setSelectedId(t.id)}
                      />
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </ScrollArea>
        </aside>

        {/* 우측: 편집 + 미리보기 */}
        <main className="flex flex-1 overflow-hidden">
          {!selected ? (
            <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
              <div className="text-center">
                <FileText className="mx-auto mb-2 h-8 w-8" />
                템플릿을 선택하거나 [+ 새 템플릿]을 눌러 시작하세요.
              </div>
            </div>
          ) : (
            <>
              {/* 편집 폼 */}
              <section className="flex w-1/2 flex-col overflow-hidden border-r">
                <div className="flex items-center justify-between border-b bg-card px-4 py-2">
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-base">{icon || '📄'}</span>
                    <span className="font-medium">{name || '(이름 없음)'}</span>
                    {isReadOnly && (
                      <Badge variant="secondary" className="text-[10px]">
                        <Lock className="mr-1 h-3 w-3" />
                        시스템 (읽기 전용)
                      </Badge>
                    )}
                    {dirty && !isReadOnly && (
                      <Badge variant="outline" className="text-[10px]">
                        변경됨
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {!isReadOnly && (
                      <>
                        <Button size="sm" onClick={save} disabled={saving || !dirty}>
                          <Save className="mr-1.5 h-4 w-4" />
                          저장
                        </Button>
                        <Button size="sm" variant="outline" onClick={remove}>
                          <Trash2 className="mr-1.5 h-4 w-4" />
                          삭제
                        </Button>
                      </>
                    )}
                  </div>
                </div>

                <ScrollArea className="flex-1">
                  <div className="space-y-4 p-4">
                    <div className="grid grid-cols-[1fr_auto] gap-2">
                      <div className="space-y-1.5">
                        <Label htmlFor="tpl-name">이름</Label>
                        <Input
                          id="tpl-name"
                          value={name}
                          onChange={(e) => onFieldChange(setName)(e.target.value)}
                          disabled={isReadOnly}
                          placeholder="예: 회의록"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="tpl-icon">아이콘</Label>
                        <Input
                          id="tpl-icon"
                          value={icon}
                          onChange={(e) => onFieldChange(setIcon)(e.target.value)}
                          disabled={isReadOnly}
                          placeholder="📋"
                          className="w-20"
                        />
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="tpl-desc">설명</Label>
                      <Textarea
                        id="tpl-desc"
                        rows={2}
                        value={description}
                        onChange={(e) => onFieldChange(setDescription)(e.target.value)}
                        disabled={isReadOnly}
                        placeholder="간단한 설명 (선택)"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="tpl-cat">카테고리</Label>
                      <Input
                        id="tpl-cat"
                        list="tpl-cat-list"
                        value={category}
                        onChange={(e) => onFieldChange(setCategory)(e.target.value)}
                        disabled={isReadOnly}
                        placeholder="예: 회의, 기획, 개발"
                      />
                      <datalist id="tpl-cat-list">
                        {categories.map((c) => (
                          <option key={c} value={c} />
                        ))}
                      </datalist>
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="tpl-body">본문 (Markdown)</Label>
                      <Textarea
                        id="tpl-body"
                        rows={16}
                        value={contentMarkdown}
                        onChange={(e) => onFieldChange(setContentMarkdown)(e.target.value)}
                        disabled={isReadOnly}
                        className="font-mono text-xs"
                        placeholder={'# {{title}}\n\n작성일: {{date}}\n작성자: {{author}}\n'}
                      />
                      <p className="text-[11px] text-muted-foreground">
                        {'{{date}} {{author}} {{title}}'} 등 변수는 페이지 생성 시 자동 치환됩니다 (FR-213).
                      </p>
                    </div>

                    <Separator />

                    <div className="space-y-1.5">
                      <Label>감지된 변수</Label>
                      {variables.length === 0 ? (
                        <p className="text-xs text-muted-foreground">
                          본문에 {'{{변수명}}'} 패턴이 없습니다.
                        </p>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {variables.map((v) => (
                            <Badge key={v} variant="outline" className="font-mono text-[11px]">
                              {`{{${v}}}`}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </ScrollArea>
              </section>

              {/* 미리보기 */}
              <section className="flex w-1/2 flex-col overflow-hidden">
                <div className="border-b bg-card px-4 py-2 text-sm font-medium">미리보기</div>
                <ScrollArea className="flex-1">
                  <div className="p-6">
                    <MarkdownView source={previewSource} />
                  </div>
                </ScrollArea>
              </section>
            </>
          )}
        </main>
      </div>
    </div>
  );
}

function TemplateListItem({
  tpl,
  active,
  onClick,
}: {
  tpl: TemplateData;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className={cn(
          'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent',
          active && 'bg-accent font-medium',
        )}
      >
        <span className="text-base">{tpl.icon || '📄'}</span>
        <span className="flex-1 truncate">{tpl.name}</span>
        {tpl.category && (
          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
            {tpl.category}
          </span>
        )}
      </button>
    </li>
  );
}
