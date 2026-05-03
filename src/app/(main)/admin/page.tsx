/**
 * 관리자 도구 — FR-805 / NFR-204 / NFR-304
 *
 * 단일 페이지 + 탭 구성:
 *   - 태그 관리 (FR-805): 이름 변경 / 병합 / 삭제
 *   - 백업/내보내기 (NFR-204): JSON / Markdown(zip)
 *   - 감사 로그 (NFR-304): 필터 + 페이지네이션
 *
 * 1차 인증 미적용. 향후 권한 체크 위치는 코드 주석으로 표시.
 *   TODO(NFR-303): admin role check (서버 라우트 + 클라이언트 가드)
 */

'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Download,
  FileJson,
  FileArchive,
  RefreshCw,
  Trash2,
  Pencil,
  Check,
  X,
  Combine,
  Search,
  Tag as TagIcon,
  ShieldAlert,
} from 'lucide-react';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { toast } from '@/components/ui/use-toast';
import { toastError } from '@/lib/toast-error';
import { downloadBlob } from '@/lib/download';
import { cn } from '@/lib/utils';

interface TagRow {
  id: string;
  name: string;
  color: string | null;
  usageCount: number;
}

interface AuditRow {
  id: string;
  entity: string;
  entityId: string;
  action: string;
  before: unknown;
  after: unknown;
  actor: string;
  createdAt: string;
}

export default function AdminPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-4 p-6">
      <header className="space-y-1">
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <ShieldAlert className="h-6 w-6 text-amber-500" />
          관리자 페이지
        </h1>
        <p className="text-xs text-muted-foreground">
          1차 오픈 환경 — 인증 미적용. 30명 사내 사용을 전제로 운영하며, 추후 NFR-303 으로 권한 체크가 추가됩니다.
        </p>
      </header>

      <Tabs defaultValue="tags" className="space-y-3">
        <TabsList>
          <TabsTrigger value="tags">태그 관리 (FR-805)</TabsTrigger>
          <TabsTrigger value="export">백업 / 내보내기 (NFR-204)</TabsTrigger>
          <TabsTrigger value="audit">감사 로그 (NFR-304)</TabsTrigger>
        </TabsList>

        <TabsContent value="tags">
          <TagAdminSection />
        </TabsContent>

        <TabsContent value="export">
          <ExportSection />
        </TabsContent>

        <TabsContent value="audit">
          <AuditLogSection />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// =====================================================================
// 태그 관리 (FR-805)
// =====================================================================

function TagAdminSection() {
  const [tags, setTags] = useState<TagRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [mergeSourceId, setMergeSourceId] = useState<string | null>(null);
  const [mergeTargetId, setMergeTargetId] = useState<string>('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/tags', { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || '로드 실패');
      setTags(json.data as TagRow[]);
    } catch (e) {
      toastError('태그 로드 실패', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return tags;
    return tags.filter((t) => t.name.toLowerCase().includes(q));
  }, [tags, filter]);

  const beginEdit = (t: TagRow) => {
    setEditingId(t.id);
    setEditName(t.name);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditName('');
  };

  const saveEdit = async (t: TagRow) => {
    const name = editName.trim();
    if (!name) {
      toast({ title: '이름을 입력하세요', variant: 'destructive' });
      return;
    }
    if (name === t.name) {
      cancelEdit();
      return;
    }
    try {
      const res = await fetch(`/api/tags/${t.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || '수정 실패');
      toast({ title: '태그 수정', description: name });
      cancelEdit();
      await load();
    } catch (e) {
      toastError('수정 실패', e);
    }
  };

  const remove = async (t: TagRow) => {
    if (!confirm(`'#${t.name}' 태그를 삭제하시겠습니까? (사용 중인 페이지 ${t.usageCount}건 에서도 제거됩니다)`)) {
      return;
    }
    try {
      const res = await fetch(`/api/tags/${t.id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || '삭제 실패');
      toast({ title: '태그 삭제', description: t.name });
      await load();
    } catch (e) {
      toastError('삭제 실패', e);
    }
  };

  const beginMerge = (t: TagRow) => {
    setMergeSourceId(t.id);
    setMergeTargetId('');
  };

  const cancelMerge = () => {
    setMergeSourceId(null);
    setMergeTargetId('');
  };

  const confirmMerge = async () => {
    if (!mergeSourceId || !mergeTargetId) return;
    if (mergeSourceId === mergeTargetId) {
      toast({ title: '병합 대상이 동일합니다', variant: 'destructive' });
      return;
    }
    const source = tags.find((t) => t.id === mergeSourceId);
    const target = tags.find((t) => t.id === mergeTargetId);
    if (!source || !target) return;
    if (
      !confirm(
        `'#${source.name}' (${source.usageCount}건) 을 '#${target.name}' 으로 병합합니다. 원본 태그는 삭제됩니다. 계속하시겠습니까?`,
      )
    ) {
      return;
    }
    try {
      const res = await fetch(`/api/tags/${source.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mergeIntoId: target.id }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || '병합 실패');
      toast({ title: '태그 병합 완료', description: `${source.name} → ${target.name}` });
      cancelMerge();
      await load();
    } catch (e) {
      toastError('병합 실패', e);
    }
  };

  return (
    <div className="space-y-3 rounded-lg border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-semibold">
          <TagIcon className="h-4 w-4" />
          태그 ({tags.length})
        </h2>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="이름 검색..."
              className="h-8 w-48 pl-7 text-sm"
            />
          </div>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={cn('mr-1.5 h-4 w-4', loading && 'animate-spin')} />
            새로고침
          </Button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          {tags.length === 0 ? '아직 태그가 없습니다.' : '검색 결과가 없습니다.'}
        </p>
      ) : (
        <div className="overflow-hidden rounded-md border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs uppercase">
              <tr>
                <th className="px-3 py-2 text-left">이름</th>
                <th className="px-3 py-2 text-left w-24">사용 빈도</th>
                <th className="px-3 py-2 text-right">동작</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((t) => {
                const isEditing = editingId === t.id;
                const isMergingSource = mergeSourceId === t.id;
                return (
                  <tr key={t.id} className="hover:bg-muted/30">
                    <td className="px-3 py-2">
                      {isEditing ? (
                        <Input
                          autoFocus
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') saveEdit(t);
                            if (e.key === 'Escape') cancelEdit();
                          }}
                          className="h-7 max-w-xs text-sm"
                        />
                      ) : (
                        <span>#{t.name}</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <Badge variant="secondary">{t.usageCount}</Badge>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex justify-end gap-1">
                        {isEditing ? (
                          <>
                            <Button size="sm" variant="ghost" onClick={() => saveEdit(t)}>
                              <Check className="h-4 w-4" />
                            </Button>
                            <Button size="sm" variant="ghost" onClick={cancelEdit}>
                              <X className="h-4 w-4" />
                            </Button>
                          </>
                        ) : isMergingSource ? (
                          <div className="flex items-center gap-1">
                            <select
                              className="h-7 rounded-md border border-input bg-background px-2 text-sm"
                              value={mergeTargetId}
                              onChange={(e) => setMergeTargetId(e.target.value)}
                            >
                              <option value="">병합 대상 선택...</option>
                              {tags
                                .filter((x) => x.id !== t.id)
                                .map((x) => (
                                  <option key={x.id} value={x.id}>
                                    #{x.name} ({x.usageCount})
                                  </option>
                                ))}
                            </select>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={confirmMerge}
                              disabled={!mergeTargetId}
                              title="병합 실행"
                            >
                              <Check className="h-4 w-4" />
                            </Button>
                            <Button size="sm" variant="ghost" onClick={cancelMerge} title="취소">
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        ) : (
                          <>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => beginEdit(t)}
                              title="이름 변경"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => beginMerge(t)}
                              title="다른 태그와 병합"
                            >
                              <Combine className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => remove(t)}
                              title="삭제"
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// =====================================================================
// 백업 / 내보내기 (NFR-204)
// =====================================================================

function ExportSection() {
  const [downloading, setDownloading] = useState<'json' | 'markdown' | null>(null);

  const download = async (format: 'json' | 'markdown') => {
    setDownloading(format);
    try {
      const res = await fetch(`/api/admin/export?format=${format}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const cd = res.headers.get('Content-Disposition') ?? '';
      const m = /filename="?([^"]+)"?/.exec(cd);
      const filename =
        m?.[1] ??
        (format === 'json'
          ? `pi-wiki-export.json`
          : `pi-wiki-markdown.${blob.type.includes('zip') ? 'zip' : 'md'}`);
      downloadBlob(blob, filename);
      toast({ title: '다운로드 시작', description: filename });
    } catch (e) {
      toastError('내보내기 실패', e);
    } finally {
      setDownloading(null);
    }
  };

  return (
    <div className="space-y-3 rounded-lg border bg-card p-4">
      <h2 className="flex items-center gap-2 font-semibold">
        <Download className="h-4 w-4" />
        일괄 내보내기
      </h2>
      <p className="text-xs text-muted-foreground">
        전체 페이지/트리/태그/Decision/ActionItem/Comment/Board/Card 데이터를 한번에 내려받습니다.
        백업 또는 외부 시스템 이관에 사용하세요 (NFR-204).
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-md border p-3">
          <div className="mb-2 flex items-center gap-2">
            <FileJson className="h-5 w-5 text-blue-500" />
            <h3 className="font-medium">JSON 일괄 내보내기</h3>
          </div>
          <p className="mb-3 text-xs text-muted-foreground">
            모든 데이터를 단일 JSON 파일로 다운로드합니다. 스키마 버전 v1.0.
          </p>
          <Button
            size="sm"
            onClick={() => download('json')}
            disabled={downloading !== null}
          >
            <Download className="mr-1.5 h-4 w-4" />
            {downloading === 'json' ? '준비 중...' : 'JSON 다운로드'}
          </Button>
        </div>

        <div className="rounded-md border p-3">
          <div className="mb-2 flex items-center gap-2">
            <FileArchive className="h-5 w-5 text-amber-500" />
            <h3 className="font-medium">Markdown 일괄 내보내기</h3>
          </div>
          <p className="mb-3 text-xs text-muted-foreground">
            페이지별 .md 파일을 트리 구조에 맞춰 ZIP 으로 묶어 다운로드합니다.
          </p>
          <Button
            size="sm"
            variant="outline"
            onClick={() => download('markdown')}
            disabled={downloading !== null}
          >
            <Download className="mr-1.5 h-4 w-4" />
            {downloading === 'markdown' ? '준비 중...' : 'Markdown ZIP 다운로드'}
          </Button>
        </div>
      </div>

      <p className="rounded-md bg-muted/50 p-2 text-[11px] text-muted-foreground">
        참고: AI 친화 포맷(임베딩 메타 포함)이 필요하면{' '}
        <a className="underline" href="/api/export?format=json" target="_blank" rel="noopener">
          /api/export
        </a>{' '}
        를 직접 호출하세요 (FR-1009).
      </p>
    </div>
  );
}

// =====================================================================
// 감사 로그 (NFR-304)
// =====================================================================

const PAGE_SIZE = 50;

function AuditLogSection() {
  const [items, setItems] = useState<AuditRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [entity, setEntity] = useState('');
  const [action, setAction] = useState('');
  const [actor, setActor] = useState('');
  const [offset, setOffset] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (entity.trim()) params.set('entity', entity.trim());
      if (action.trim()) params.set('action', action.trim());
      if (actor.trim()) params.set('actor', actor.trim());
      params.set('limit', String(PAGE_SIZE));
      params.set('offset', String(offset));
      const res = await fetch(`/api/admin/audit?${params.toString()}`, { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || '로드 실패');
      setItems(json.data.items as AuditRow[]);
      setTotal(json.data.total as number);
    } catch (e) {
      toastError('감사 로그 로드 실패', e);
    } finally {
      setLoading(false);
    }
  }, [entity, action, actor, offset]);

  useEffect(() => {
    load();
  }, [load]);

  // setOffset(0) 이 변경을 일으키면 load 가 effect 로 재실행된다. offset 이 이미 0 이면
  // 필터 입력은 keystroke 마다 load 의존성을 갱신하며 effect 가 이미 동기화 시켰다.
  const applyFilters = () => {
    setOffset(0);
  };

  const resetFilters = () => {
    setEntity('');
    setAction('');
    setActor('');
    setOffset(0);
  };

  const page = Math.floor(offset / PAGE_SIZE) + 1;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-3 rounded-lg border bg-card p-4">
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 font-semibold">
          <ShieldAlert className="h-4 w-4" />
          감사 로그 ({total})
        </h2>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={cn('mr-1.5 h-4 w-4', loading && 'animate-spin')} />
          새로고침
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
        <div className="space-y-1">
          <Label className="text-xs">엔티티</Label>
          <Input
            value={entity}
            onChange={(e) => setEntity(e.target.value)}
            placeholder="Page, Tag, Template..."
            className="h-8 text-sm"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">액션</Label>
          <Input
            value={action}
            onChange={(e) => setAction(e.target.value)}
            placeholder="create, update, delete..."
            className="h-8 text-sm"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">행위자</Label>
          <Input
            value={actor}
            onChange={(e) => setActor(e.target.value)}
            placeholder="이름 (부분일치)"
            className="h-8 text-sm"
          />
        </div>
        <div className="flex items-end gap-2">
          <Button size="sm" onClick={applyFilters} disabled={loading}>
            적용
          </Button>
          <Button size="sm" variant="outline" onClick={resetFilters}>
            초기화
          </Button>
        </div>
      </div>

      <ScrollArea className="h-[480px] rounded-md border">
        {loading ? (
          <p className="p-6 text-center text-sm text-muted-foreground">로딩 중...</p>
        ) : items.length === 0 ? (
          <p className="p-6 text-center text-sm text-muted-foreground">감사 로그가 없습니다.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-muted/80 text-xs uppercase backdrop-blur">
              <tr>
                <th className="px-3 py-2 text-left">시각</th>
                <th className="px-3 py-2 text-left">엔티티</th>
                <th className="px-3 py-2 text-left">ID</th>
                <th className="px-3 py-2 text-left">액션</th>
                <th className="px-3 py-2 text-left">행위자</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {items.map((row) => (
                <tr key={row.id} className="hover:bg-muted/30">
                  <td className="px-3 py-2 whitespace-nowrap text-xs text-muted-foreground">
                    {format(new Date(row.createdAt), 'yyyy-MM-dd HH:mm:ss')}
                  </td>
                  <td className="px-3 py-2">
                    <Badge variant="outline">{row.entity}</Badge>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">{row.entityId}</td>
                  <td className="px-3 py-2">
                    <ActionBadge action={row.action} />
                  </td>
                  <td className="px-3 py-2">{row.actor}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </ScrollArea>

      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {total === 0 ? '0' : `${offset + 1} - ${Math.min(offset + items.length, total)}`} / {total}
        </p>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
            disabled={offset === 0 || loading}
          >
            이전
          </Button>
          <span className="text-xs">
            {page} / {totalPages}
          </span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setOffset(offset + PAGE_SIZE)}
            disabled={offset + PAGE_SIZE >= total || loading}
          >
            다음
          </Button>
        </div>
      </div>
    </div>
  );
}

const ACTION_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  delete: 'destructive',
  create: 'default',
  update: 'secondary',
};

function ActionBadge({ action }: { action: string }) {
  return <Badge variant={ACTION_VARIANT[action] ?? 'outline'}>{action}</Badge>;
}
