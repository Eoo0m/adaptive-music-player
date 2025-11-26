# 🎵 Dynamic Music Player

Supabase 임베딩 기반 음악 추천 플레이어

## 기능

- **검색 기반 추천**: 노래를 검색하고 선택하면 Supabase 벡터 임베딩을 활용해 유사한 음악을 추천
- **적응형 재생**: 사용자의 청취 패턴에 따라 유사한(Similar) 또는 다양한(Diverse) 음악을 자동 추천
- **Spotify 통합**: Spotify Web Playback SDK를 사용한 실시간 재생

## 설정 방법

### 1. 환경 변수 설정

`.env` 파일을 생성하고 다음 정보를 입력하세요:

```bash
# Spotify OAuth
SPOTIFY_CLIENT_ID=your_spotify_client_id
SPOTIFY_CLIENT_SECRET=your_spotify_client_secret
REDIRECT_URI=https://api.dynplayer.win/callback

# Supabase
SUPABASE_URL=your_supabase_url
SUPABASE_KEY=your_supabase_anon_key

# Server
PORT=8889
```

### 2. Supabase 데이터베이스 설정

다음 함수들을 Supabase에서 생성해야 합니다:

#### `search_tracks_by_title` 함수

```sql
create or replace function search_tracks_by_title(
  query_text text,
  match_count int default 10
)
returns table (
  id int8,
  track_key text,
  title text,
  artist text,
  album text,
  pos_count int,
  similarity float
)
language sql
as $$
  with candidates as (
    select *
    from track_embeddings
    where title ilike '%' || query_text || '%'
       or artist ilike '%' || query_text || '%'
    limit 50
  )
  select
    id,
    track_key,
    title,
    artist,
    album,
    pos_count,
    1 - (embedding <=> (
        select embedding
        from candidates
        order by pos_count desc
        limit 1
    )) as similarity
  from candidates
  order by embedding <=> (
      select embedding
      from candidates
      order by pos_count desc
      limit 1
  )
  limit match_count;
$$;
```

#### `match_tracks_by_key` 함수

```sql
create or replace function match_tracks_by_key(
  input_track_key text,
  match_count int default 10
)
returns table (
  id int8,
  track_key text,
  title text,
  artist text,
  album text,
  pos_count int,
  similarity float
)
language sql
as $$
  with base as (
    select embedding
    from track_embeddings
    where track_key = input_track_key
    limit 1
  )
  select
    t.id,
    t.track_key,
    t.title,
    t.artist,
    t.album,
    t.pos_count,
    1 - (t.embedding <=> base.embedding) as similarity
  from track_embeddings t, base
  where t.track_key != input_track_key
  order by t.embedding <=> base.embedding
  limit match_count;
$$;
```

### 3. 의존성 설치

```bash
npm install
```

### 4. 서버 실행

```bash
npm start
```

서버는 `http://127.0.0.1:8889`에서 실행됩니다.

## API 엔드포인트

### POST `/search-songs`
노래 제목이나 아티스트로 검색합니다.

**요청:**
```json
{
  "query": "love"
}
```

**응답:**
```json
{
  "results": [
    {
      "track_id": 5823,
      "track_key": "7qEHsqek33rTcFNT9PFqLf",
      "track": "Someone You Loved",
      "artist": "Lewis Capaldi",
      "album": "Divinely Uninspired To A Hellish Extent",
      "pos_count": 1022,
      "similarity": 1
    }
  ]
}
```

### POST `/recommend`
특정 트랙과 유사한 음악을 추천합니다.

**요청:**
```json
{
  "track_key": "7qEHsqek33rTcFNT9PFqLf",
  "num_recommendations": 30
}
```

### POST `/recommend-diverse-tracks`
다양한 음악을 추천합니다.

**요청:**
```json
{
  "spotify_track": {
    "name": "Someone You Loved",
    "artists": [{"name": "Lewis Capaldi"}]
  },
  "access_token": "your_spotify_access_token"
}
```

### POST `/find-spotify-tracks`
로컬 추천 결과를 Spotify 트랙으로 매칭합니다.

## 사용 방법

1. Spotify 계정으로 로그인
2. 검색창에 좋아하는 노래 제목이나 아티스트 입력
3. 검색 결과에서 곡 선택
4. 자동으로 유사한 음악 플레이리스트 생성 및 재생

## 기술 스택

- **Frontend**: Vanilla JavaScript, HTML5, CSS3
- **Backend**: Node.js, Express
- **Database**: Supabase (PostgreSQL + pgvector)
- **Music**: Spotify Web API & Web Playback SDK
- **Vector Search**: pgvector cosine similarity

## 라이선스

MIT
