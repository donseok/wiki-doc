import pg from 'pg';
const c = new pg.Client({ host: 'localhost', port: 5432, user: 'piwiki', password: 'piwiki', database: 'piwiki' });
await c.connect();
const tables = await c.query(`
  SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename
`);
console.log('── 테이블 목록 ──');
console.log(tables.rows.map((r) => r.tablename).join('\n'));
console.log('\n── 행 수 (주요 테이블) ──');
const counts = ['TreeNode', 'Page', 'PageVersion', 'Template', 'Tag', 'Comment', 'Decision', 'ActionItem', 'PageWatch', 'Notification', 'Board', 'Card', 'Whiteboard', 'Attachment', 'EditSession', 'AuditLog'];
for (const t of counts) {
  try {
    const r = await c.query(`SELECT COUNT(*) AS n FROM "${t}"`);
    console.log(`  ${t.padEnd(16)} ${r.rows[0].n}`);
  } catch (e) {
    console.log(`  ${t.padEnd(16)} ERR ${(e instanceof Error ? e.message : '').split('\n')[0]}`);
  }
}
console.log('\n── 확장 ──');
const ext = await c.query(`SELECT extname FROM pg_extension ORDER BY extname`);
console.log(ext.rows.map((r) => r.extname).join(', '));
await c.end();
