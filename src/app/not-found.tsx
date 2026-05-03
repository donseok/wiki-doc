import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background p-8">
      <h1 className="text-4xl font-bold">404</h1>
      <p className="text-muted-foreground">요청하신 페이지를 찾을 수 없습니다.</p>
      <Link href="/dashboard" className="text-sm text-primary hover:underline">
        대시보드로 이동
      </Link>
    </div>
  );
}
