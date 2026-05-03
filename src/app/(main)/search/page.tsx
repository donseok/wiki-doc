import { Suspense } from 'react';
import { SearchView } from './search-view';

export const dynamic = 'force-dynamic';

export default function SearchPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">검색 화면 로딩 중...</div>}>
      <SearchView />
    </Suspense>
  );
}
