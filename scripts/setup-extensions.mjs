import pg from 'pg';
const c = new pg.Client({
  host: 'localhost',
  port: 5432,
  user: 'piwiki',
  password: 'piwiki',
  database: 'piwiki',
});
await c.connect();
for (const ext of ['pg_trgm', 'btree_gin']) {
  try {
    await c.query(`CREATE EXTENSION IF NOT EXISTS ${ext}`);
    console.log(`✔ ${ext}`);
  } catch (e) {
    console.log(`⤬ ${ext}: ${e instanceof Error ? e.message : e}`);
  }
}
try {
  await c.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_ts_config WHERE cfgname = 'korean') THEN
        EXECUTE 'CREATE TEXT SEARCH CONFIGURATION korean (COPY = simple)';
      END IF;
    END$$;
  `);
  console.log('✔ ts config: korean');
} catch (e) {
  console.log(`⤬ korean: ${e instanceof Error ? e.message : e}`);
}
await c.end();
