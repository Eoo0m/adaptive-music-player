# 🚀 dynplayer.win 간단 배포

## 1단계: GitHub 업로드
```bash
git add .
git commit -m "dynplayer.win 배포 준비"
git push
```

## 2단계: Cloudflare Pages 연결
1. [Cloudflare Dashboard](https://dash.cloudflare.com) 로그인
2. Pages → "Create a project" → GitHub 저장소 선택
3. **설정:**
   - Build command: `npm install`
   - Build output: `/`
   
4. **환경변수 추가:**
   ```
   SPOTIFY_CLIENT_SECRET = 4941121b4d4a40dbab635da6645c8cd7
   ```

5. Deploy!

## 3단계: 도메인 연결
- Custom domains에서 `dynplayer.win` 추가
- DNS 자동 설정됨

## 완료! 🎉
https://dynplayer.win 접속 가능