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
