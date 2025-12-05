
# 🎧 DynPlayer — Adaptive Music Recommendation Player

>https://dynplayer.win

<img width="588" height="510" alt="Screenshot 2025-11-26 at 3 11 39 PM" src="https://github.com/user-attachments/assets/4620573d-a787-4377-b68a-949ebb9bd2a8" />



<img width="378" height="238" alt="image" src="https://github.com/user-attachments/assets/cf21609d-728a-4a57-be32-16e3247cf84e" />



## Embedding(Contrastive Learning)

대조학습 기반 트랙 임베딩 학습

<img width="499" height="342" alt="image" src="https://github.com/user-attachments/assets/bc434300-790c-4726-86e0-68ec2aabd536" />




> $\ell_i = -\log\sum_{j\in P_i} p(j\mid i)
= \log\sum_{k\neq i}e^{s_{ik}} - \log\sum_{j\in P_i}e^{s_{ij}}$


**linear evaluation:**

task: spotify genre 400여개 기준 genre prediction

**Top-1 Acc: 0.6207, Top-5 Acc: 0.8856을 달성.**

---


## **Frontend (Cloudflare Pages)**

- GitHub Repo → Cloudflare Pages 자동 배포
- Pure HTML/CSS/JS 기반 iPod-style Player UI
- OAuth Access Token → Web Playback SDK 연동

---


## Backend (Node.js api server)

환경: PM2, Nginx Reverse Proxy, Ubuntu(Naver Cloud)


### **🎯GET /login**

**Spotify OAuth 로그인 시작**

### **🎯GET /callback?code=…**

**Spotify authorization code → access_token 교환**

### **🎯POST /search-songs**

**제목·아티스트 검색 → Supabase RPC(search_tracks_by_title)**

### **🎯POST /recommend**

**track_key 기반 유사 트랙 추천 → Supabase RPC(match_tracks_by_key)**

### **🎯POST /find-spotify-tracks**

**트랙  key→ Spotify 트랙 URI 매핑**

### **🎯GET /health**

---

## Database (Supabase PostgreSQL + RPC 함수)

| **track_key** | **embeddings** | **artist** | **song_title** | **pos_count** | **album** |
| --- | --- | --- | --- | --- | --- |
| **3QaPy1KgI7nu9FJEQUgn6h** | **[0.12,0.32…]** | **Billie Eilish** | **WILDFLOWER**| **668** | **HIT ME HARD AND SOFT** |

### **🎯match_tracks_by_key**

“임베딩 기반 유사도 계산” 수행

- 입력: track_key
- 출력: (추천 후보 30개)

### **🎯search_songs**

- 입력: 텍스트 쿼리
- 출력: track_key 리스트
