# Caro Frontend

## Overview
AI 기반 음악 추천 플레이어 프론트엔드. 바닐라 HTML/CSS/JS, SPA (단일 페이지).

## Tech Stack
- **Framework**: 없음 (순수 HTML/CSS/JS)
- **Deploy**: Cloudflare Pages (git push 시 자동 배포)
- **Backend**: https://api.caromusic.kr
- **Domain**: https://caromusic.kr/app

## Project Structure
```
app.html             # 단일 HTML 엔트리포인트
css/styles.css       # 전체 스타일
js/
  main.js            # Auth, 탭 전환, 찜, 홈피드, 취향 지도(music-map),
                     # 플레이어(MusicKit), 다음 곡 선택, 플리 빌더
  search.js          # 검색 (트랙/키워드/스마트), 검색 결과 표시, 검색 홈 그리드
  recommend.js       # Two-Tower 추천
```

## UI 구조
1. **로그인 화면** — Caro 로고 + Apple 로그인 / 게스트 버튼
2. **사이드바** (좌측 72px 고정) — 검색 / 찜 / 취향지도 / Apple Music 연동 / 설정
3. **검색 탭**
   - 비검색 상태: 취향지도 트랙 70개 (7열) 그리드 (`search-home-grid`)
   - 검색 중: 로딩 dots
   - 검색 결과: 엔티티(제목/아티스트) + 무드(키워드) 결과 그리드
4. **찜 탭** — 프로필 카드 + 저장한 곡 그리드
5. **취향지도 탭** — Canvas 기반 인터랙티브 지도
6. **설정 탭** — 프로필 카드 + 로그아웃
7. **플레이어 위젯** (우측 하단 고정) — 재생/정지, 앨범아트, 다음곡, 다이나믹

## 플레이어
- **Apple Music 연동** (`musicKitInstance`) 필수 — 미연동 시 YouTube 검색으로 fallback
- `playWithAppleMusic(track, onFail)` — `setQueue({ songs: [apple_music_id], startPlaying: true })`
- `playerTogglePlayPause()` — `musicKitInstance.pause()` / `play()`
- `playerIsPlaying` 상태는 `playbackStateDidChange` 이벤트(state === 2)로 동기화
- **다음곡 (`/next-track`)**: 유사곡 — 가까운 상위 10%
- **다이나믹 (`/dynamic-next`)**: 다른 곡 — 먼 상위 30%
- **프리페치**: 곡 재생 시작 시 `_prefetchNextTracks(trackKey)` 호출 → 두 엔드포인트 미리 패칭, 버튼 클릭 시 캐시 hit으로 즉시 사용

## 취향지도 캐싱 (3단계)
1. **sessionStorage** (`mapCache_<keys>`) — 가장 빠름
2. **DB** (`/user-maps/latest`) — 찜 목록 동일하면 hit
3. **재계산** (`/music-map`) — 위 둘 miss 시 호출 후 DB 저장
- `/favorites`와 `/user-maps/latest`는 병렬 요청
- `lastFavorites`가 이미 있으면 `/favorites` 재요청 생략

## 검색 홈 그리드
- `window.lastMapData.tracks`에서 70개 랜덤 샘플
- `search-home-grid` 클래스: `repeat(auto-fill, minmax(120px, 160px))`, `#searchHome padding: 24px 40px`
- 데이터 없으면 로딩 dots, 프리페치 완료 시 자동 렌더

## Auth
- JWT를 localStorage에 저장 (`auth_token`)
- Apple Sign In → `/auth/apple/mobile` → JWT 발급
- `getAuthHeaders()`로 Bearer 토큰 첨부
- `login_type`: `'apple'` | `'google'`

## 찜 (Optimistic UI)
- 버튼 클릭 즉시 UI 반영 (`lastFavorites` 업데이트 포함)
- API 실패 시 롤백

## Action Logging
모든 유저 행동을 `/log-action`으로 전송:
- `search`, `select_from_search`, `select_from_recommend`, `favorite`, `play`

## Notes
- Cloudflare 캐시로 JS 업데이트 지연 가능 → Cmd+Shift+R 필요
- 배포: git push → Cloudflare Pages 자동 배포
- `window.lastMapData` — search.js에서 접근하므로 반드시 `window.`으로 할당
