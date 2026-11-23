# UI 컴포넌트 — 패널 / 메뉴 / 카드

> 2026-11-23 추가된 컴포넌트 중심으로 정리.

---

## 트랙 dots 메뉴 (`_openTrackMenu`)

**위치**: `js/main.js`

트랙 카드의 `...` 버튼을 누르면 뜨는 컨텍스트 메뉴. 현재 항목:

| 항목 | 동작 |
|---|---|
| 저장하기 / 저장 취소 | `toggleFavorite()` |
| 추천 보기 | 검색탭으로 이동 후 해당 트랙 `openTrackDetail()` |
| 플레이리스트에 추가 | `openPlaylistPickerPanel(track)` → 빌드1 패널 |
| 코멘트 달기 | `openCommentPanel(track)` → 코멘트 패널 |

---

## 패널 오버레이 공통 구조

**CSS**: `.panel-overlay` + `.panel-sheet`

아래에서 올라오는 bottom-sheet 패턴. 배경 클릭 시 닫힘.

```
.panel-overlay (fixed, inset:0, 반투명 배경, z-index:1000)
  └── .panel-sheet (최대 높이 80vh, 아래서 슬라이드 업)
        ├── .panel-sheet-header (sticky, 제목 + 닫기 버튼)
        └── 내용...
```

`overlay.classList.add('visible')` → opacity + translateY 트랜지션으로 등장.
`_closePanelOverlay()` → `id="playlistPickerOverlay"` 또는 `id="commentPanelOverlay"` 제거.

---

## 플레이리스트 선택 패널 (빌드1)

**함수**: `openPlaylistPickerPanel(track)` — `js/main.js`
**열리는 곳**: dots 메뉴 "플레이리스트에 추가" / 검색탭 히어로 카드 `+` 버튼

구조:
```
panel-sheet
  ├── panel-sheet-header "플레이리스트에 추가"
  ├── pl-picker-create-row
  │     ├── pl-picker-name-input (새 플리 이름 입력)
  │     └── pl-picker-add-btn (+) → POST /playlist-builder/playlist/create → 바로 곡 추가
  └── pl-picker-list
        └── pl-picker-item × N (기존 플리, 클릭 시 바로 추가)
```

**API**:
- 새 플리 생성: `POST /playlist-builder/playlist/create`
- 곡 추가: `POST /playlist-builder/playlist/{id}/add-track`

---

## 플레이리스트 빌드2 패널

**함수**: `openPlaylistBuilderPanel()` — `js/favorites.js`
**열리는 곳**: 저장탭 플레이리스트 섹션 헤더 `+` 버튼 (`.pl-create-btn`)

구조:
```
panel-sheet--large (최대 92vh)
  ├── panel-sheet-header
  │     ├── pl-builder-title-input (플리 이름 입력)
  │     └── 닫기 버튼
  ├── pl-builder-selected-box (담은 곡, 가로 스크롤)
  │     └── pl-builder-selected-card × N (클릭 시 담기 해제)
  ├── pl-builder-box-label "저장된 곡"
  ├── pl-builder-fav-grid (5열, 세로 스크롤)
  │     └── pl-builder-fav-card × N (클릭 시 상단으로 이동, .selected 표시)
  └── pl-builder-save-btn → POST /playlist-builder/save
```

---

## 코멘트 패널

**함수**: `openCommentPanel(track)` — `js/main.js`
**열리는 곳**: dots 메뉴 "코멘트 달기" / 검색탭 히어로 카드 말풍선 버튼

구조:
```
panel-sheet
  ├── panel-sheet-header "코멘트"
  ├── comment-panel-hero (커버 70px + 곡명/아티스트)
  └── comment-panel-input-row
        ├── comment-panel-textarea
        └── comment-panel-submit → POST /comments
```

---

## 검색탭 히어로 카드 버튼 그룹

**위치**: `js/search.js` — `openTrackDetail()` 내부

트랙 선택 시 뜨는 상단 카드 오른쪽에 버튼 4개:

| 버튼 | 아이콘 | 동작 |
|---|---|---|
| 재생 | ▶ | `openTrackOnYouTube(track)` |
| 하트 | ♥ | `_toggleFavCard()` |
| + | 플러스 | `openPlaylistPickerPanel(track)` |
| 말풍선 | 💬 | `openCommentPanel(track)` |

**CSS**: `.search-grid-heart` (공통, `position:static`으로 오버라이드)
버튼 그룹은 `display:flex; gap:6px; margin-left:auto` div로 묶임.

---

## 저장탭 "내 코멘트" 섹션

**함수**: `_makeCommentsSection()` — `js/favorites.js`
**위치**: `renderFavorites()` 맨 아래에 추가

마운트 시 `GET /comments/my` 호출 → 비동기 렌더링.

```
fav-section
  ├── fav-section-title "내 코멘트"
  └── fav-comments-list
        └── fav-comment-item × N
              ├── fav-comment-cover (44px)
              ├── fav-comment-body (트랙명 · 아티스트 + 코멘트 텍스트)
              └── fav-comment-delete (×) → DELETE /comments/{id}
```

---

## 취향 그룹 토글 (Ward 클러스터링)

**위치**: `js/favorites.js` — `_makeFavPagedSection()` 헤더

iOS 스타일 토글 스위치 (`.fav-cluster-toggle-wrap`).

- OFF: 최신순 그리드 (기본)
- ON: `GET /favorites/clustered` 호출 → Ward threshold=1.5, 1~3곡 소규모 클러스터는 가장 가까운 큰 클러스터에 병합

**상태**: `_favClusterMode` (전역), `_favClusterData` (캐시, `loadFavorites()` 시 초기화)
