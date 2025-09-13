# 🎵 Adaptive Music Player

iPod 스타일 AI 음악 추천 플레이어

## 🎯 주요 기능

- **AI 추천**: 청취 패턴 분석으로 자동 추천 모드 전환
- **iPod 인터페이스**: 클릭휠 컨트롤과 드래그 이동
- **Spotify 연동**: 브라우저에서 직접 음악 재생

## 🏗️ 아키텍처

```
[브라우저] → [Cloudflare] → [Nginx] → [Node.js API] → [Python AI] → [Spotify API]
```

## 🔧 기술 스택

- **Frontend**: HTML, CSS, JavaScript, Spotify Web SDK
- **Backend**: Node.js, Python Flask
- **AI**: NumPy 벡터, 코사인 유사도

## 📁 구조

```
├── frontend/index.html     # iPod UI
└── backend/
    ├── server.js           # API 서버
    └── recommendation_service.py  # AI 엔진
```

## 🚀 실행

```bash
# 백엔드
cd backend
npm install && pip install -r requirements.txt
npm start

# 프론트엔드
cd frontend
python -m http.server 8000
```

## 🎵 데모

[dynplayer.win](https://dynplayer.win)