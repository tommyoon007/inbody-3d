# 인바디 3D · 윤홍기

인바디 기록을 **체형 이미지 변신 시뮬레이터**와 **변신 갤러리**로 보는 개인 PWA.
GitHub Pages: https://tommyoon007.github.io/inbody-3d/

## 화면 구성

| 모드 | 내용 |
| --- | --- |
| 변신 시뮬레이터 | 현재 체형 사진과 목표 체형 사진을 겹쳐 두고, 날짜 슬라이더·`▶ 변화 과정 보기` 진행률에 따라 부드럽게 크로스페이드. 미세한 호흡 효과 |
| 변신 갤러리 | 비포·애프터 비교 슬라이더, 수치 비교표, 날짜별 카드, 기록 추가·내보내기 |

두 화면 모두 **상의 탈의 + 검은 스포츠 반바지**(피트니스 바디체크 스타일)로 표현해 복부·가슴·어깨·허벅지 변화가 바로 보입니다.

### 🎯 부위별 업그레이드 · 맞춤 운동 팁

선택한 기록의 `체지방률 · 복부지방률 · 내장지방레벨 · 골격근량`으로 세 부위(복부·내장지방 / 하체 대근육 / 상체·코어)의 필요도를 점수화해 1~3순위로 보여 주고, 순위에 맞춘 주간 운동 계획을 함께 표시합니다. 슬라이더로 날짜를 바꾸거나 목표 체형을 고르면 팁과 주간 계획이 그 상태에 맞게 바뀌고, 목표에 도달하면 "유지·강화 모드"로 전환됩니다.

## 데이터 갱신 방법

새 인바디 결과를 받으면 `data.json`의 `records` 배열에 항목을 추가하고 커밋하면 됩니다.

```json
{
  "id": "2026-11-30",
  "date": "2026-11-30",
  "label": "3차 측정",
  "weight": 85.1,
  "skeletalMuscle": 34.9,
  "bodyFatMass": 23.6,
  "bodyFatPct": 27.7,
  "bmi": 27.5,
  "score": 71,
  "waistRatio": 0.99,
  "visceralFat": 10,
  "bmr": 1702
}
```

- 측정되지 않은 항목은 `null`로 두면 체지방률로 추정합니다 (`estimated` 플래그를 두면 화면에 "추정"으로 표시).
- 목표 프리뷰는 `"goal": true` 항목으로, 항상 타임라인 마지막에 놓입니다.
- 앱에서 직접 추가한 기록은 기기 `localStorage`에 저장되며, `JSON 내보내기`로 받은 파일을 `data.json`에 합치면 모든 기기에 반영됩니다.

## 이미지 변신 규칙

- 타임라인의 마지막 실측 기록까지는 `assets/body-current.webp`, 마지막 실측 → 목표 구간에서 `assets/body-goal.webp`가 슬라이더 값에 따라 opacity로 겹쳐집니다 (`app.js`의 `figureProgress()`).
- 두 이미지는 같은 프레임(900×1350)으로 만들어져 있어 인물 위치가 일치하고, 그래서 크로스페이드가 자연스러운 변신처럼 보입니다.
- 새 체형 이미지를 만들면 같은 크기(900×1350)·구도로 `assets/body-current.webp`(또는 `body-goal.webp`)를 교체하면 됩니다. 원본 PNG를 WebP로 바꾸려면 `python3 -c "from PIL import Image; Image.open('assets/body-current.png').save('assets/body-current.webp','WEBP',quality=92,method=6)"`.
- 원본 `assets/body-current.png`·`body-goal.png`는 보관용(사이트는 WebP 사용, 두 파일 합계 약 2.6MB → WebP 약 130KB).

## 파일

- `assets/body-current.webp` — 실측 체형 이미지 (10/26 측정 87.7kg · 29.9% 기준, 원본 `body-current.png`). 새 측정이 쌓여도 새 이미지를 만들기 전까지는 이 이미지를 그대로 씁니다.
- `assets/body-goal.webp` — 목표 체형(75.0kg · 17.5%) 이미지 (원본 `body-goal.png`)
- `index.html`, `app.js`, `styles.css` — 화면·변신 로직·스타일 (외부 라이브러리 없음)
- `sw.js`, `manifest.json` — 오프라인 PWA
