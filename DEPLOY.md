# TIDY — GitHub Pages 배포 가이드

개인 GitHub 계정으로 TIDY 앱을 폰에서 쓰기 위한 배포 셋업. **레포 생성·push는 직접**, 폴더 구조와 파일은 준비 완료.

---

## 1. 폴더 구조 (배포 관련)

레포 **루트**에 앱이 있어야 Pages가 바로 서비스합니다. 이미 맞춰뒀습니다:

```
TIDY/                         ← 이 폴더를 레포 루트로 push
├── index.html               ★ 앱 본체 (자체 완결 — 데이터 임베드)
├── manifest.webmanifest     PWA 매니페스트 (홈 화면 설치)
├── sw.js                    서비스워커 (오프라인 캐시)
├── icon.svg                 앱 아이콘
├── .nojekyll                Jekyll 비활성 (정적 그대로 서빙)
├── .gitignore
├── docs/00~13-*.md          (선택) 설계·구매 문서 14개
├── data/                    (선택) 원본 데이터 — 앱은 임베드라 런타임에 불필요
├── prototype/tidy.mjs       (선택) 알고리즘 프로토타입
└── ui/*.mockup.html         (선택) 개별 화면 목업 (설계 참고용)
```

> **앱 실행에 꼭 필요한 것**: `index.html · manifest.webmanifest · sw.js · icon.svg · .nojekyll`
> 나머지(docs·data·prototype)는 개인 기록용이라 함께 올려도, 빼도 무방합니다.

---

## 2. 레포 생성 & push

로컬 git은 **이미 초기화됨**(`main` 브랜치, 커밋 전). GitHub에서 **빈 레포만 생성**한 뒤(README 등 체크 없이) 아래 실행 — 레포 루트 = TIDY:

```bash
cd /Users/guun.park/Documents/Personal/TIDY
git add .
git commit -m "TIDY 의류 관리 앱 + 설계 문서"
git remote add origin https://github.com/<사용자명>/<레포명>.git
git push -u origin main
```

> 이미 `git init`·`main` 브랜치는 되어 있으니 `init`/`branch -M`은 생략.
> (원격을 이미 붙였다면 `git remote add` 대신 `git remote set-url origin ...`)

> **공개(public) 레포 권장** — GitHub Pages 무료.
> 비공개(private) 레포에서 Pages는 유료 플랜(Pro) 필요. 무료로 비공개를 원하면 **Netlify/Cloudflare Pages**(private 지원)를 대신 쓰세요.

---

## 3. GitHub Pages 켜기

1. 레포 → **Settings → Pages**
2. **Source**: `Deploy from a branch`
3. **Branch**: `main` / `/ (root)` → **Save**
4. 1~2분 후 상단에 URL 표시:
   ```
   https://<사용자명>.github.io/<레포명>/
   ```
   → 이 주소가 곧 앱입니다 (루트 index.html 자동 서빙).

---

## 4. 폰에 앱으로 설치

1. 폰 브라우저(사파리/크롬)로 위 URL 접속
2. **공유 → 홈 화면에 추가**
3. 홈 화면 아이콘으로 실행 → 주소창 없는 앱처럼 뜸(standalone)
4. 오프라인에서도 열림(서비스워커 캐시), 구매 체크는 **그 폰에 저장**(localStorage)

> ⚠️ **iOS 아이콘**: SVG 아이콘이라 iOS 홈 화면 아이콘이 단순 표시될 수 있음. 예쁜 아이콘 원하면 나중에 `apple-touch-icon.png`(180×180) 추가.
> ⚠️ **저장 범위**: 구매 체크·상태는 **기기별 localStorage**라 폰↔PC 동기화는 안 됩니다(개인 단일 기기 사용 기준).

---

## 5. 앱 수정 → 재배포

`index.html` 편집 후:
```bash
git add index.html && git commit -m "앱 수정" && git push
```
→ push하면 Pages가 자동 재배포(1~2분). 서비스워커가 네트워크 우선이라 새로고침 시 최신 반영.

---

## 참고
- `index.html`이 **배포 정본**입니다. (Nimbalyst 목업 에디터에서 이 앱을 미리 보려면 `index.html`을 `app.mockup.html`로 복사해서 열면 됩니다 — nim-preview 브라우저는 인라인 JS를 막아 빈 화면으로 보임.)
- 로컬 테스트: `python3 -m http.server 8000` → `http://localhost:8000/` (서비스워커·PWA 동작 확인 가능).
