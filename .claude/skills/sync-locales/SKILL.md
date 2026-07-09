---
name: sync-locales
description: "user 앱의 9개 언어 locale 파일(ko, en, ja, zh-CN, zh-TW, th, vi, fr, es)의 동기화 상태를 검증하고, 누락된 키를 찾아 보충하는 스킬. 사용 시점: (1) /sync-locales 명령 실행 시, (2) UI 텍스트를 추가·수정한 후, (3) 새 페이지를 추가한 후, (4) 번역 누락이 의심될 때."
argument-hint: "[검증만 | 자동보충]"
---

# Locale Sync Skill — Kotourlive User App

user 앱의 9개 언어 JSON 파일(`user/locales/*.json`)을 비교 검증하여 누락된 키, 빈 값, 구조 불일치를 찾아내고, 필요 시 누락된 키를 보충한다.

## 지원 언어 (9개)

| 코드 | 언어 | 파일 |
|------|------|------|
| ko | 한국어 | `user/locales/ko.json` |
| en | 영어 (기준) | `user/locales/en.json` |
| ja | 일본어 | `user/locales/ja.json` |
| zh-CN | 중국어 간체 | `user/locales/zh-CN.json` |
| zh-TW | 중국어 번체 | `user/locales/zh-TW.json` |
| th | 태국어 | `user/locales/th.json` |
| vi | 베트남어 | `user/locales/vi.json` |
| fr | 프랑스어 | `user/locales/fr.json` |
| es | 스페인어 | `user/locales/es.json` |

**기준 파일**: `ko.json`을 마스터로 사용한다. 모든 키는 ko.json에 먼저 존재해야 한다.

## Workflow

```
1. 파일 로드     → 9개 JSON 파일 읽기
2. 키 비교       → ko.json 기준으로 각 언어별 누락/초과 키 탐지
3. 빈 값 검사    → 값이 빈 문자열("")인 항목 탐지
4. 구조 검증     → 중첩 객체 구조 일치 여부 확인
5. EJS 사용 검증 → views에서 사용된 i18n 키가 실제 존재하는지 확인
6. 결과 보고     → 요약 리포트 출력
7. 자동 보충     → 사용자 요청 시 누락 키를 영어 값으로 채움
```

## Step 1: 파일 로드

`user/locales/` 디렉토리에서 9개 JSON 파일을 모두 읽는다.

```
user/locales/ko.json  (마스터)
user/locales/en.json
user/locales/ja.json
user/locales/zh-CN.json
user/locales/zh-TW.json
user/locales/vi.json
user/locales/fr.json
user/locales/es.json
```

## Step 2: 키 비교

ko.json의 모든 키를 기준으로 각 언어 파일과 비교한다.

### 탐지 항목

| 유형 | 설명 | 심각도 |
|------|------|--------|
| **누락 키 (Missing)** | ko.json에는 있지만 다른 언어에 없는 키 | 높음 |
| **초과 키 (Extra)** | 다른 언어에는 있지만 ko.json에 없는 키 | 중간 |
| **빈 값 (Empty)** | 키는 존재하지만 값이 `""` | 높음 |
| **타입 불일치 (Type Mismatch)** | ko.json에서는 객체인데 다른 언어에서 문자열 등 | 높음 |

### 중첩 키 처리

JSON이 중첩 객체일 경우 dot notation으로 키를 표현한다:

```json
{
  "nav": {
    "home": "홈",
    "festivals": "축제"
  }
}
```

→ 키: `nav.home`, `nav.festivals`

## Step 3: 빈 값 검사

모든 파일에서 값이 빈 문자열(`""`)인 항목을 찾는다. 이는 번역이 아직 완료되지 않은 항목이다.

## Step 4: 구조 검증

ko.json의 중첩 구조와 다른 파일의 중첩 구조가 동일한지 확인한다.

예시 오류:
```
ko.json: "nav" → 객체 { "home": "홈" }
en.json: "nav" → 문자열 "Navigation"   ← 구조 불일치!
```

## Step 5: EJS 뷰 사용 검증

`user/views/` 디렉토리의 EJS 파일에서 i18n 함수 호출을 찾아 실제 locale 파일에 해당 키가 존재하는지 확인한다.

### 검색 패턴

EJS에서 i18n을 사용하는 패턴:

```
__('key.name')
__("key.name")
res.__('key.name')
req.__('key.name')
```

각 키가 ko.json에 존재하는지 확인하고, 없으면 보고한다.

## Step 6: 결과 보고

검증 결과를 아래 형식으로 출력한다:

```
=== Locale Sync Report ===

기준 파일: ko.json (총 N개 키)

[누락 키 - Missing Keys]
  en.json : 3개 누락
    - nav.mypage
    - footer.copyright
    - esim.title
  ja.json : 5개 누락
    - ...

[초과 키 - Extra Keys]
  en.json : 1개 초과
    - legacy.old_key (ko.json에 없음)

[빈 값 - Empty Values]
  fr.json : 2개
    - nav.concerts
    - footer.terms

[EJS 사용 키 누락]
  views/pages/festivals/list.ejs 에서 사용:
    - festivals.filter_region (ko.json에 없음)

[요약]
  총 파일: 9개
  동기화 완료: 3개 (ko, en, ja)
  동기화 필요: 5개
  누락 키 합계: 23개
  빈 값 합계: 7개
```

## Step 7: 자동 보충 (선택)

사용자가 "자동보충" 인자를 전달하거나 보충을 요청하면:

1. **누락 키 채우기**: 해당 언어 파일에 누락된 키를 추가한다
   - 값은 `en.json`의 값을 기본값으로 사용 (영어 없으면 ko.json 값)
   - 값 앞에 `[TODO]` 접두사를 붙여 번역 필요 표시: `"[TODO] Home"`
2. **JSON 정렬 유지**: 기존 파일의 키 순서를 유지하며 새 키는 ko.json 순서에 맞춰 삽입
3. **결과 확인**: 보충 후 다시 검증을 실행하여 동기화 상태 확인

### 보충 예시

ko.json에 `"nav.mypage": "마이페이지"`가 있고 en.json에 `"nav.mypage": "My Page"`가 있을 때,
fr.json에 누락되어 있으면:

```json
// fr.json에 추가
"mypage": "[TODO] My Page"
```

## 주의사항

- **ko.json이 마스터이다.** 새 키는 반드시 ko.json에 먼저 추가한 후 다른 언어에 동기화한다.
- JSON 파일 수정 시 **UTF-8 인코딩, 2칸 들여쓰기**를 유지한다.
- 자동 보충된 `[TODO]` 항목은 나중에 적절한 번역으로 교체해야 한다.
- `__()` 함수에 변수가 포함된 경우 (`__('key', { name: value })`) 키만 추출한다.
