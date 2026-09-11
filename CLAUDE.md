# Caro Frontend

## Overview
AI 기반 음악 추천 플레이어 프론트엔드. 바닐라 HTML/CSS/JS, SPA (단일 페이지).

## Tech Stack
- **Framework**: 없음 (순수 HTML/CSS/JS)
- **Deploy**: Cloudflare Pages (git push 시 자동 배포)
- **Backend**: https://api.caromusic.kr
- **Domain**: https://caromusic.kr

## Project Structure
```
index.html           # 단일 HTML 엔트리포인트
css/styles.css       # 전체 스타일
js/
  main.js            # Auth, 탭 전환, 찜/홈피드, 액션 로그, 비주얼 이펙트
  search.js          # 검색 (트랙/키워드), 검색 결과 표시, 트랙 선택
  recommend.js       # Two-Tower 추천, 앨범 그리드 표시
```

## UI 구조
1. **로그인 화면** — Caro 로고 + Google 로그인 / 게스트 버튼
2. **사이드 탭** (좌측) — 홈(집) / 검색(돋보기) / 찜(하트)
3. **검색 화면** — 트랙/키워드 모드 전환, 검색 결과 리스트
4. **추천 화면** — 5x3 앨범 커버 그리드 (선택 곡 초록 테두리)
5. **홈 피드** — 찜한 곡 기반 유사곡 카드 3개 (6x2 그리드)
6. **찜 목록** — 프로필 카드 + 저장한 곡 그리드

## 주요 인터랙션
- **싱글 클릭**: 추천 로드
- **더블 클릭**: YouTube 재생 (추천 안 됨)
- **하트 버튼**: 앨범 커버 호버 시 표시, 클릭으로 찜/해제
- 클릭/더블클릭 분리: `onClickOrDblClick` 헬퍼 (250ms 타이머)

## Auth
- JWT 토큰을 localStorage에 저장
- Google OAuth 콜백 시 URL 파라미터로 토큰 수신
- `getAuthHeaders()`로 API 요청에 Bearer 토큰 첨부

## Action Logging
모든 유저 행동을 `/log-action`으로 전송:
- `search` — 검색 실행
- `select_from_search` — 검색 결과에서 선택
- `select_from_recommend` — 추천에서 선택
- `favorite` — 찜 추가/해제
- `play` — 더블클릭 YouTube 재생

## Notes
- 비로그인도 검색/추천 가능, 찜/홈피드는 로그인 필요
- Cloudflare 캐시로 JS 업데이트 지연 가능 → Cmd+Shift+R 필요할 수 있음
