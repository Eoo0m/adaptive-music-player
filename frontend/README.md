# 🎨 Dynplayer Frontend

iPod 클래식 스타일의 Spotify 웹 플레이어 UI

## 배포 (Cloudflare Pages)

1. GitHub 레포지토리를 Cloudflare Pages에 연결
2. 빌드 설정:
   - **Build command**: (비워둠)
   - **Build output directory**: `/`
   - **Root directory**: `frontend`

3. 커스텀 도메인 설정:
   - `dynplayer.win` 추가

## 로컬 개발

```bash
# 단순 HTTP 서버로 실행
python -m http.server 8000
# 또는
npx serve .
```

http://localhost:8000 접속

## 주요 기능

- iPod 클릭휠 인터페이스
- Spotify Web Playback SDK 통합
- 반응형 디자인
- 실시간 재생 상태 표시