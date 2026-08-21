-- AI 경기 분석 캐시 테이블
-- Supabase 대시보드 → SQL Editor에 붙여넣고 Run
-- RLS를 켜되 정책을 만들지 않음 = 브라우저(anon key)에서는 접근 불가,
-- 서버(service role key)만 읽고 쓸 수 있다.

create table public.game_analysis (
  cache_key text primary key,        -- "gamePk:날짜"
  game_date date not null,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

alter table public.game_analysis enable row level security;

-- 오래된 캐시 정리가 필요하면 (선택):
-- delete from public.game_analysis where game_date < current_date - 7;
