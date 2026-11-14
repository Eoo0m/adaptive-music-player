# 프론트 CSS 기초 메모

---

## 용어 정리

| 용어 | 설명 |
|---|---|
| **뷰포트** | 브라우저에서 실제로 보이는 화면 영역 |
| **부모** | 나를 감싸고 있는 바깥 div |
| **자식** | 내 안에 들어있는 div |
| **div** | HTML의 기본 블록. 화면을 구성하는 네모 칸 |
| **패널** | 화면 위에 뜨는 독립적인 UI 구역 |
| **모달** | 뒤를 막고 반드시 닫아야 하는 팝업 |
| **오버레이** | 기존 화면 위에 겹쳐서 뜨는 모든 것 |

---

## position 종류

```css
position: static    /* 기본값. 그냥 위에서 아래로 흐름 */
position: relative  /* 원래 자리 기준으로 약간 이동 */
position: absolute  /* 가장 가까운 부모 기준으로 위치 */
position: fixed     /* 뷰포트(화면) 기준으로 위치. 스크롤해도 안 움직임 */
```

**핵심 차이:**
- `absolute` → 부모가 어디 있느냐에 따라 위치가 달라짐
- `fixed` → 부모 무시, 항상 브라우저 화면 기준

---

## 가운데 정렬 공식

### 수평 가운데

```css
/* 방법 1: left + transform (fixed/absolute에서 사용) */
position: fixed;
left: 50%;
transform: translateX(-50%);
```

**왜 두 줄이 필요한가?**
- `left: 50%` → div의 왼쪽 끝을 화면 중앙에 놓음 → 오른쪽으로 치우침
- `translateX(-50%)` → div 자신의 너비 절반만큼 왼쪽으로 당김 → 중심이 가운데

```
화면 1500px, div 900px일 때:

left: 50%만 하면:
|←────────────[div──────────────────→|
              750px에서 시작 → 치우침

translateX(-50%) 추가:
|←─────[div────────────]─────→|
        300px에서 시작 → 가운데
```

### 수직 + 수평 동시에

```css
position: fixed;
top: 50%;
left: 50%;
transform: translate(-50%, -50%);
```

---

## 사이드탭이 있을 때 가운데 맞추는 팁

사이드탭이 왼쪽에 `fixed`로 붙어있으면, `left: 50%` 가운데가 **시각적으로는** 약간 왼쪽으로 치우쳐 보임.

이유: 수학적 가운데(화면 1/2)와 시각적 가운데(사이드탭 제외한 나머지 영역의 1/2)가 다르기 때문.

```
화면 전체:  |[사이드탭]←────────────────→|
수학적 50%:            ↑ (전체 화면의 절반)
시각적 50%:                    ↑ (사이드탭 제외한 영역의 절반)
```

**해결 방법: margin-left로 오프셋**

```css
position: fixed;
left: 50%;
transform: translateX(-50%);
margin-left: 45px; /* 사이드탭 너비의 절반 */
```

---

## CSS 캐시 버스팅

HTML에서 CSS를 불러올 때 버전 번호를 붙이면 브라우저가 캐시를 무시하고 새 파일을 가져옴.

```html
<link rel="stylesheet" href="css/styles.css?v=20261114" />
```

CSS를 수정했는데 반영이 안 될 때 → `?v=` 뒤 숫자를 바꿔서 푸시.

---

## 이 프로젝트 주요 패널들

| 패널 | CSS class | position | 기준 |
|---|---|---|---|
| 검색창 | `.search-interface` | fixed | 뷰포트 |
| 검색 결과/홈 | `#searchBody` | fixed | 뷰포트 |
| 찜 목록 | `.favorites-view` | fixed | 뷰포트 |
| 취향 지도 | `.map-view` | fixed | 뷰포트 |
| 사이드탭 | `.side-tab` | fixed | 뷰포트 |

---

## 검색창 구조 — 드롭다운과 결과가 독립적인 이유

### 레이어 구조

```
z-index 200  .search-autocomplete   ← 자동완성 드롭다운 (검색창 바로 아래)
z-index 100  .search-interface      ← 검색창 (항상 화면 상단 고정)
z-index  95  #searchBody            ← 검색 결과 전체 화면
```

**z-index** = 숫자가 클수록 위에 뜸. 같은 화면에 겹쳐있을 때 누가 앞에 나오는지 결정.

---

### 드롭다운은 검색창에 종속

자동완성(드롭다운)은 `.search-interface` 안에 들어있음.

```
.search-interface (fixed, 화면 상단 가운데)
  └── input (검색 입력창)
  └── .search-autocomplete (드롭다운, 검색창 너비와 동일)
  └── #searchRecentChips (최근 검색어)
```

→ 검색창이 움직이면 드롭다운도 같이 움직임. 부모-자식 관계이기 때문.

---

### 검색 결과는 검색창과 완전 독립

`#searchBody`는 `.search-interface`의 자식이 아님. 완전히 별개의 div.

```html
<div class="search-interface">검색창 + 드롭다운</div>
<div id="searchBody">검색 결과 전체 화면</div>  ← 형제(sibling) 관계
```

→ 검색창을 클릭하거나 배경을 클릭해도 결과가 사라지지 않음.
→ 결과가 뜬 채로 검색창에서 자동완성도 독립적으로 작동.

---

### 검색 결과 안의 레이어 구조

`#searchBody` 안에 `position: absolute` div들이 쌓임:

```
#searchBody (fixed, 전체 화면)
  └── #searchHome      (홈 안내 텍스트, 기본 상태)
  └── #searchResults   (검색 결과 그리드, 검색 후)
  └── #trackDetailPanel (트랙 클릭 시 상세 패널, z-index:10)
```

`absolute`이기 때문에 `#searchBody` 안에서만 위치가 잡힘. 화면 전체를 덮는 건 `#searchBody`가 `fixed`로 전체를 차지하기 때문.

---

### 이슈 히스토리

| 이슈 | 원인 | 해결 |
|---|---|---|
| 검색 결과가 600px 너비로 제한됨 | `#searchResults`에 `max-width: 600px` 남아있었음 | `position: absolute; left:0; right:0`으로 변경 |
| 엔터 치면 자동완성이 같이 뜸 | 자동완성 타이머가 엔터 후에도 실행됨 | 엔터 시 `clearTimeout` 추가 |
| 뒤로가기 누르면 빈 화면 | `_closeTrackDetail()`이 결과를 다시 안 보여줌 | `_showSearchResults()` 호출 추가 |
| 한국어 입력 시 엔터 두 번 | IME(한글 조합) 중에도 keydown 이벤트 발생 | `e.isComposing` 체크로 조합 중엔 무시 |
| 찜 토글이 반대로 작동 | JS에서 미리 상태를 뒤집고 API 호출 | 미리 뒤집는 코드 제거, API 응답 후 반영 |

---

## 트랙 상세 패널 — 열기/닫기 로직

### 레이어 구조 (다시)

```
#searchBody
  ├── #searchHome         ← 기본 홈 화면
  ├── #searchResults      ← 검색 결과 그리드
  └── #trackDetailPanel   ← 트랙 상세 (z-index: 10, 위에 덮음)
```

세 div가 모두 `position: absolute`로 `#searchBody` 안에 겹쳐 있음.
어떤 걸 `hidden`으로 숨기느냐에 따라 무엇이 보이는지 결정됨.

---

### 열기: 커버 클릭 → `_openTrackDetail(track)`

```
1. #trackDetailPanel.innerHTML 초기화
2. 뒤로가기 버튼 생성 → addEventListener('click', _closeTrackDetail)
3. 선택된 트랙 카드 렌더링 (커버 + 제목 + 아티스트 + 찜버튼)
4. 로딩 dots 표시
5. API /find-similar-tracks 호출 (비동기)
6. 응답 오면 유사곡 그리드 렌더링
7. #trackDetailPanel.classList.remove('hidden') → 패널이 결과 위에 덮임
```

**왜 `onclick="..."`이 아니라 `addEventListener`를 쓰나?**
`innerHTML`로 버튼을 만들면 문자열 안에 함수 이름을 넣어야 하는데,
`search.js`의 함수는 전역이 아닐 수 있어서 `onclick` 문자열이 작동 안 할 수 있음.
`addEventListener`는 JS 객체를 직접 참조하므로 확실하게 연결됨.

---

### 닫기: 뒤로가기 → `_closeTrackDetail()`

```javascript
function _closeTrackDetail() {
    // 1. 패널 숨기고 내용 비움
    panel.classList.add('hidden');
    panel.innerHTML = '';

    // 2. 검색 결과가 있으면 결과로, 없으면 홈으로
    if (searchResults.children.length > 0) {
        _showSearchResults();  // #searchResults 보여줌
    } else {
        _showSearchHome();     // #searchHome 보여줌
    }
}
```

**이슈 히스토리:**
- 처음엔 `_closeTrackDetail`이 패널만 숨기고 아무것도 안 보여줬음 → 빈 화면
- `_showSearchResults()` 호출 추가로 해결

---

### 유사곡 카드 클릭 → 패널 갱신 (스택처럼 동작)

유사곡 카드를 클릭하면 `_openTrackDetail(rec)`을 다시 호출.
패널 innerHTML을 초기화하고 새 트랙으로 다시 렌더링.
→ 뒤로가기는 항상 "검색 결과"로 돌아감 (히스토리 스택은 없음)
