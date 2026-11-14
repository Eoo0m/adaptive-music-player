# Caro 프론트엔드 성능 최적화 노하우

## 1. 다음 곡 API 프리페치

**문제**: 다음곡/다이나믹 버튼 누르면 API 요청 → 응답 대기 → 재생 시작 순서라 체감 지연 발생
**해결**: 곡 재생 시작 직후 `/next-track`과 `/dynamic-next`를 백그라운드로 미리 요청

```js
// 곡 재생 시작 시 즉시 프리페치
function _prefetchNextTracks(trackKey) {
    for (const ep of ['next-track', 'dynamic-next']) {
        const cacheKey = `${ep}:${trackKey}`;
        if (!_prefetchCache[cacheKey]) {
            _prefetchCache[cacheKey] = fetch(...)
                .then(r => r.ok ? r.json() : null)
                .catch(() => null);
        }
    }
}
```

버튼 클릭 시 `await _prefetchCache[cacheKey]`로 이미 완료된 Promise를 즉시 소비.
API 왕복 30~40ms가 사용자 체감에서 사라짐.

**Swift도 동일 적용**: `play()` 완료 후 `async let`으로 두 엔드포인트 병렬 패칭 + Song 객체(`MusicCatalogResourceRequest`)도 미리 조회해 캐싱.

---

## 2. 병렬 API 요청

**문제**: 순차 요청 시 각 RTT가 누적됨
**해결**: 독립적인 요청은 `Promise.allSettled` / `async let`으로 동시에

```js
// /favorites + /user-maps/latest 병렬
const [favsRes, dbRes] = await Promise.allSettled([
    fetch(`/favorites`, ...),
    fetch(`/user-maps/latest`, ...),
]);
```

취향지도 로드 시 찜 목록 조회와 DB 캐시 조회를 동시에 → 대기 시간 절반.

---

## 3. 이미 받아둔 데이터 재활용

**문제**: `fetchMusicMapData()` 호출마다 `/favorites` 재요청
**해결**: `lastFavorites`가 있으면 재요청 생략

```js
if (lastFavorites && lastFavorites.length > 0) {
    trackKeys = lastFavorites.slice(0, 20).map(f => f.track_key);
} else {
    // 그때만 fetch
}
```

---

## 4. Optimistic UI (찜 버튼)

**문제**: API 응답 기다린 후 색 변경 → 버튼이 느리게 반응
**해결**: 클릭 즉시 UI 반영, API는 백그라운드, 실패 시 롤백

```js
// 즉시 반영
btn.classList.add('favorited');
lastFavorites = [newTrack, ...lastFavorites];

// 백그라운드 API
try {
    const res = await fetch(...);
    if (!res.ok) throw new Error();
} catch {
    // 롤백
    btn.classList.remove('favorited');
    lastFavorites = lastFavorites.filter(f => f.track_key !== track.track_key);
}
```

---

## 5. 로딩 중 dots — 지루하지 않게

**목적**: 응답 대기 중 사용자가 "앱이 멈췄나?" 느끼지 않도록
**적용 위치**:
- 검색 결과 로딩 중 (`#searchLoadingDots`)
- 다음곡/다이나믹 버튼 로딩 중 (두 버튼 위 오버레이 `#playerNextLoading`)
- 검색 홈 그리드 데이터 대기 중

```css
.search-loading-dots span {
    animation: search-dot-bounce 1s infinite ease-in-out;
}
/* 각 점 딜레이로 순차적 bounce 효과 */
span:nth-child(2) { animation-delay: .15s; }
span:nth-child(3) { animation-delay: .3s; }
```

다음곡 버튼은 dots가 두 버튼을 모두 덮는 오버레이로 — 로딩 중 중복 클릭 방지도 겸함.

---

## 6. pgvector ANN으로 서버 사이드 연산 이전

**문제**: `/next-track`, `/dynamic-next`에서 Python numpy로 300개 임베딩 코사인 유사도 계산 → ~1초
**해결**: pgvector HNSW 인덱스 + `ORDER BY embedding <=> $vector` → 30~40ms

```sql
-- next-track: 가까운 순
ORDER BY v.embedding <=> $2::vector
LIMIT $4

-- dynamic-next: 먼 순
ORDER BY v.embedding <=> $2::vector DESC
LIMIT $4
```

인덱스: `idx_simgcl_embedding_hnsw` (`vector_cosine_ops`, m=32, ef=200)

---

## 7. Apple Music stop() 제거

**문제**: `setQueue()` 전에 `stop()` await → 두 번 기다림
**해결**: `setQueue({ startPlaying: true })`가 자동으로 기존 곡 중단하므로 `stop()` 불필요

```js
// Before
await musicKitInstance.stop();
await musicKitInstance.setQueue({ songs: [id], startPlaying: true });

// After
await musicKitInstance.setQueue({ songs: [id], startPlaying: true });
```
