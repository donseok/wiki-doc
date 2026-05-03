/**
 * 개발용 임베디드 PostgreSQL 기동 스크립트.
 *
 * Docker/PostgreSQL 미설치 환경에서 npm 패키지(embedded-postgres)가 자동으로
 * Postgres 바이너리를 다운로드/관리한다. 첫 실행 시 ~80MB 다운로드 후 캐시.
 *
 * 사용:
 *   node scripts/start-postgres.mjs
 *     → 5432 포트에 piwiki 사용자/데이터베이스 준비, 콘솔에 접속 정보 출력.
 *     → Ctrl+C 로 종료.
 *
 * 운영 환경에서는 사용 금지 — docker-compose.yml 기반 배포 사용.
 */

import EmbeddedPostgres from 'embedded-postgres';
import { mkdirSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const root = join(__dirname, '..');
const dataDir = join(root, '.embedded-postgres-data');
if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });

const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: 'piwiki',
  password: 'piwiki',
  port: 5432,
  persistent: true,
});

const isInitialized = existsSync(join(dataDir, 'PG_VERSION'));

console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('PI Wiki — Embedded PostgreSQL');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log(`데이터 디렉터리: ${dataDir}`);

try {
  if (!isInitialized) {
    console.log('▶ 초기화 (initdb) ...');
    await pg.initialise();
  }

  console.log('▶ Postgres 기동 (port 5432) ...');
  await pg.start();

  if (!isInitialized) {
    console.log('▶ 데이터베이스 piwiki 생성 ...');
    await pg.createDatabase('piwiki').catch((e) => {
      // 이미 있으면 무시
      if (!String(e).includes('already exists')) throw e;
    });
  }

  // 확장 활성화 시도
  console.log('▶ 확장(pgvector / pg_trgm / btree_gin) 활성화 시도 ...');
  const client = pg.getPgClient();
  await client.connect();

  const extensions = ['pg_trgm', 'btree_gin', 'vector'];
  for (const ext of extensions) {
    try {
      await client.query(`CREATE EXTENSION IF NOT EXISTS ${ext}`);
      console.log(`  ✔ ${ext}`);
    } catch (e) {
      console.log(`  ⤬ ${ext} — 미지원 (${(e instanceof Error ? e.message : String(e)).split('\n')[0]})`);
    }
  }

  // 한국어 검색 설정
  try {
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_ts_config WHERE cfgname = 'korean') THEN
          EXECUTE 'CREATE TEXT SEARCH CONFIGURATION korean (COPY = simple)';
        END IF;
      END$$;
    `);
    console.log('  ✔ 텍스트 검색 설정: korean');
  } catch (e) {
    console.log(`  ⤬ korean ts config — ${e instanceof Error ? e.message : e}`);
  }

  await client.end();

  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('✅ Postgres 준비 완료');
  console.log('   DATABASE_URL=postgresql://piwiki:piwiki@localhost:5432/piwiki');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Ctrl+C 로 종료');
} catch (err) {
  console.error('❌ Postgres 기동 실패:', err);
  process.exit(1);
}

// graceful shutdown
const shutdown = async () => {
  console.log('\n▶ Postgres 중지 ...');
  try {
    await pg.stop();
    console.log('✅ 중지 완료');
  } catch (e) {
    console.error('중지 중 오류:', e);
  }
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
process.on('SIGBREAK', shutdown);

// keep alive
setInterval(() => {}, 1 << 30);
