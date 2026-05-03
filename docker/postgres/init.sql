-- PI Wiki PostgreSQL 초기화 스크립트
-- 실행 시점: 컨테이너 첫 기동 시 1회 (volume이 비어 있을 때만)

-- 1) 확장(Extensions)
--    pgvector: NFR-504 벡터 검색 인프라 준비 (1차 미사용, 컬럼만 정의)
--    pg_bigm:  FR-302 한국어 N-gram 부분 일치 검색
--    pg_trgm:  fallback / 유사도 검색 보조
--    btree_gin: 복합 인덱스 지원
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS btree_gin;

-- pg_bigm 은 base image (pgvector/pgvector:pg16) 에 미포함이므로
-- 운영 시에는 별도의 커스텀 이미지를 빌드하거나, 1차 단계에서는 pg_trgm 으로 대체한다.
-- 운영 단계 진입 시 docker/postgres/Dockerfile 을 추가하여 pg_bigm 을 빌드해 포함시킬 것.
-- (FR-302: pg_bigm 또는 형태소 분석 중 택1 — 인프라 준비 단계에서는 pg_trgm 으로 부분 일치 보장)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_bigm') THEN
    EXECUTE 'CREATE EXTENSION IF NOT EXISTS pg_bigm';
  END IF;
END$$;

-- 2) 권한 (piwiki 사용자가 모든 객체 소유자가 되도록 보장)
ALTER DATABASE piwiki SET search_path TO public;

-- 3) 검색 환경
--    Korean text search config: simple 기반 (한국어 형태소 분석기는
--    별도 익스텐션이 없을 경우 simple로 fallback. pg_bigm/trgm 으로 부분 일치 보완)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_ts_config WHERE cfgname = 'korean') THEN
    EXECUTE 'CREATE TEXT SEARCH CONFIGURATION korean (COPY = simple)';
  END IF;
END$$;
