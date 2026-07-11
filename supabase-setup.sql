-- 채팅 메시지 테이블 + 보안 정책 + 실시간 설정
-- Supabase 대시보드 → SQL Editor → New query에 전체 붙여넣고 Run

create table public.messages (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  nickname text not null,
  text text not null check (char_length(text) between 1 and 300),
  created_at timestamptz not null default now()
);

-- 행 수준 보안: 읽기는 누구나, 쓰기는 로그인한 본인만
alter table public.messages enable row level security;

create policy "누구나 읽기 가능"
  on public.messages for select
  using (true);

create policy "로그인한 사용자만 본인 명의로 작성"
  on public.messages for insert
  to authenticated
  with check (auth.uid() = user_id);

-- 실시간(INSERT 알림) 활성화
alter publication supabase_realtime add table public.messages;
