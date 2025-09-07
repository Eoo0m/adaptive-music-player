# 🎵 Spotify iPod - 우주에서 음악 감상하기

우주 배경에서 클래식한 iPod 클릭휠로 Spotify 음악을 재생할 수 있는 웹 애플리케이션입니다.

## 🚀 설정 방법

### 1. Spotify 앱 등록
1. [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)에 접속
2. "Create App" 클릭
3. 앱 정보 입력:
   - App name: `Spotify iPod`
   - App description: `iPod interface for Spotify`
   - Redirect URI: `http://localhost:3000/callback`
   - APIs used: Web Playbook SDK
4. 생성된 앱에서 `Client ID`와 `Client Secret` 복사

### 2. 환경 변수 설정
`spotify-local/api/.env` 파일에서 다음 정보를 입력하세요:

```env
SPOTIFY_CLIENT_ID=your_spotify_client_id_here
SPOTIFY_CLIENT_SECRET=your_spotify_client_secret_here
REDIRECT_URI=http://localhost:3000/callback
PORT=3000
```

### 3. 서버 실행
```bash
cd spotify-local/api
npm start
```

### 4. 브라우저에서 접속
http://localhost:3000으로 접속하여 Spotify로 로그인하세요.

## 🎮 사용법

### iPod 클릭휠 컨트롤
- **가운데 버튼**: 재생/일시정지
- **+ 버튼**: 볼륨 증가
- **- 버튼**: 볼륨 감소  
- **⏮ 버튼**: 이전 랜덤 곡
- **⏭ 버튼**: 다음 랜덤 곡

### 특징
- 🌌 우주 배경과 반짝이는 별들
- 🎵 사용자의 저장된 음악에서 랜덤 재생
- 📱 클래식한 iPod 디자인
- ✨ 재생 중일 때 iPod 애니메이션 효과
- 🔄 자동으로 다음 곡 재생

## 📋 요구사항

- **Spotify Premium 계정** (Web Playback SDK 사용을 위해 필요)
- **최신 브라우저** (Chrome, Firefox, Safari, Edge)
- **Node.js** (v16 이상)

## 🛠️ 기술 스택

- **Backend**: Node.js + Express
- **Frontend**: Vanilla JavaScript + Spotify Web SDK
- **Authentication**: Spotify OAuth 2.0
- **Styling**: Pure CSS with animations

## ⚠️ 참고사항

- Spotify Premium 계정이 없으면 재생이 제한될 수 있습니다
- 브라우저에서 autoplay 정책에 따라 첫 재생 시 사용자 상호작용이 필요할 수 있습니다
- 로그인 정보는 브라우저의 localStorage에 저장됩니다

## 🎯 개발 모드

개발 중일 때는 다음 명령어로 서버를 실행하세요:

```bash
cd spotify-local/api  
npm run dev  # 파일 변경 시 자동 재시작
```

즐거운 음악 감상되세요! 🚀✨