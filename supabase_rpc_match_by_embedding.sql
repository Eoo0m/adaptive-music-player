-- 임베딩 벡터로 유사한 트랙 검색하는 RPC 함수
-- Supabase SQL Editor에서 실행하세요

CREATE OR REPLACE FUNCTION match_tracks_by_embedding(
  query_embedding vector(512),
  match_count int DEFAULT 5
)
RETURNS TABLE (
  id int8,
  track_key text,
  title text,
  artist text,
  album text,
  pos_count int,
  similarity float
)
LANGUAGE sql
AS $$
  SELECT
    id,
    track_key,
    title,
    artist,
    album,
    pos_count,
    1 - (embedding <=> query_embedding) AS similarity
  FROM new_track_embeddings
  WHERE embedding IS NOT NULL
  ORDER BY embedding <=> query_embedding
  LIMIT match_count;
$$;
