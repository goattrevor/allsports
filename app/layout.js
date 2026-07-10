import './globals.css'

export const metadata = {
  title: 'allsports — 스포츠 경기 일정',
  description: '야구 · 농구 · 축구 경기 일정과 실시간 스코어를 한 곳에서 (한국시간 기준)',
}

export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  )
}
