# 검색 탭 뒤로가기 네비게이션

## 개요

`js/search.js` 상단에 구현된 State 기반 내부 스택 방식.
브라우저 history API 사용하지 않음.

## 화면 종류

| screen | 설명 |
|---|---|
| `home` | 검색 홈 (취향 기반 추천 그리드) |
| `search` | 검색결과 (entity + mood 그리드) |
| `detail` | 트랙 디테일 패널 (유사곡 목록) |

## 핵심 변수

```js
const _navStack = [];                          // 이전 화면 기록
let _currentScreen = { screen: 'home', data: {} };  // 현재 화면
```

## 동작 방식

이동할 때 **현재 화면을 스택에 push**하고 `_currentScreen`을 업데이트.
뒤로가기 시 스택에서 **pop해서 복원**.

```
홈 → 추천 클릭           : stack = [home],        current = detail
홈 → 추천1 → 추천2       : stack = [home, detail], current = detail2
검색 → 추천 클릭          : stack = [search],       current = detail
```

## 주요 함수

### `_navNavigate(screen, data)`
화면 전환 시 호출. 현재 화면(scrollTop 포함)을 스택에 push하고 `_currentScreen` 업데이트.

```js
// 카드 클릭 → detail로 이동
_navNavigate('detail', { track });
```

### `_navPop()`
뒤로 버튼 클릭 시 호출. 스택에서 pop해서 이전 화면 복원.
- `home` → `_showSearchHome()`
- `search` → `_showSearchResults()` + `_renderSearchResultsFromData()`
- `detail` → `_openTrackDetail(track, skipNav=true)`
  ※ `skipNav=true` 필수 — 아니면 `_navNavigate`가 다시 호출되어 무한루프 발생

스크롤 위치도 복원 (50ms setTimeout).

### `_navReset()`
스택 초기화. 다음 상황에서 호출:
- 새 검색 시작 (`doSearch`)
- X 버튼으로 검색창 초기화 (`_clearSearchInput`)
- 검색 탭 재진입 (`switchTab('search')`)

### `_clearSearchInput()`
X 버튼 클릭 시 호출. 단순 검색창 초기화가 아니라 **전체 상태 초기화**:
- 검색창 비우기
- `_navReset()` — 스택 초기화
- `trackInfo` 숨기기 (추천결과 패널)
- `initialSongInput`에서 `mini` 클래스 제거
- `trackDetailPanel` 닫기
- `_showSearchHome()` — 홈으로 이동

어떤 화면(추천결과, 디테일 패널)에 있든 X 누르면 항상 홈으로 돌아감.

### `_updateBackBtn()`
스택이 비어있으면 뒤로 버튼 숨김, 아니면 표시.

## 주의사항

- **검색결과는 nav destination이 아님**: `doSearch` 완료 시 `_navNavigate` 대신 `_currentScreen`만 업데이트. 검색결과 화면에서 뒤로 버튼이 보이면 안 됨.
- **`_openTrackDetail` 복원 시 반드시 `skipNav=true`**: 뒤로가기로 detail 복원 시 `_navNavigate`가 다시 호출되지 않도록.
- **각 entry에 scrollTop 저장**: push 시점의 `searchBody.scrollTop`을 함께 저장해 복원 시 스크롤 위치도 되돌림.
