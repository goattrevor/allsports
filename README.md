# ⚾ 야구 경기 일정

MLB · KBO 경기 일정 및 선발투수를 한국시간 기준으로 보여주고, 지정된 형식으로 복사할 수 있는 웹앱입니다.

## 복사 형식

```
[6월 21일(일) MLB 경기 일정 및 선발투수 (한국시간 기준)]

■ 02:10 - 시카고 화이트삭스 (뉴컴) VS 디트로이트 타이거스 (멜튼)
■ 05:10 - 밀워키 브루어스 (해리슨) VS 애틀랜타 브레이브스 (세일)
```

## 데이터 소스

- **MLB**: [MLB Stats API](https://statsapi.mlb.com) (무료 공개 API)
- **KBO**: Naver Sports 파싱

---

## 로컬 실행

```bash
npm install
npm run dev
# http://localhost:3000
```

## Vercel 배포 (권장)

### 방법 1 — GitHub + Vercel 연동 (가장 쉬움)

1. GitHub에 새 레포 만들기
2. 이 폴더 전체 push
   ```bash
   git init
   git add .
   git commit -m "init"
   git remote add origin https://github.com/YOUR_ID/baseball-schedule.git
   git push -u origin main
   ```
3. [vercel.com](https://vercel.com) → New Project → GitHub 레포 선택
4. 설정 그대로 두고 Deploy → 완료!

### 방법 2 — Vercel CLI

```bash
npm i -g vercel
vercel
# 질문에 모두 Enter → 자동 배포
```

배포 후 `https://baseball-schedule-xxx.vercel.app` 형태의 URL이 생성됩니다.

---

## 구조

```
app/
  page.js          # 메인 UI (날짜 선택, 탭, 복사 버튼)
  layout.js        # HTML 레이아웃
  globals.css      # 전역 스타일
  api/
    mlb/route.js   # MLB Stats API 프록시
    kbo/route.js   # KBO 파싱 (Naver Sports)
lib/
  mlb.js           # MLB 팀명 한국어 변환, 선발투수 파싱
```
