import pg from 'pg';
const c = new pg.Client({
  host: 'localhost',
  port: 5432,
  user: 'piwiki',
  password: 'piwiki',
  database: 'piwiki',
});
await c.connect();
const r = await c.query(
  "SELECT name FROM pg_available_extensions WHERE name IN ('vector','pg_trgm','btree_gin') ORDER BY name",
);
console.log('AVAILABLE:', r.rows.map((x) => x.name).join(', ') || '(none)');
const r2 = await c.query(
  "SELECT extname FROM pg_extension WHERE extname IN ('vector','pg_trgm','btree_gin') ORDER BY extname",
);
console.log('INSTALLED:', r2.rows.map((x) => x.extname).join(', ') || '(none)');
await c.end();
