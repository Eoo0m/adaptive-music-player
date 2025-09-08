[사용자 브라우저]
      │
      ▼
[Cloudflare DNS/Proxy]
  ├─ dynplayer.win  ──▶ [Cloudflare Pages]  ──▶ 정적(HTML/JS/CSS)
  └─ api.dynplayer.win ─▶ [NCP 공인IP 223.130.128.15]
                             │
                             ▼
                        [Nginx (80/443)]
                             │ (reverse proxy)
                             ▼
                    http://127.0.0.1:8889
                        [Node.js(API) - PM2]
                             │ (HTTP 내부 통신)
                             ▼
                    http://127.0.0.1:5001
                 [Python Flask 추천서비스]
                             │ (외부 API 호출)
                             └──▶ Spotify Accounts/Web API