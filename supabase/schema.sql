-- 風流オンライン用スキーマ
-- Supabase SQL Editor で一度実行する

create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  mode text not null check (mode in ('haiku', 'tanka', 'shirazu')),
  max_players int not null check (max_players between 1 and 6),
  phase text not null default 'lobby'
    check (phase in ('lobby', 'writing', 'reveal')),
  host_id text not null,
  step_index int not null default 0,
  poems jsonb not null default '[]'::jsonb,
  turn jsonb,
  theme text not null default '',
  created_at timestamptz not null default now()
);

-- 既存 DB 向け（未追加なら実行）
alter table public.rooms
  add column if not exists theme text not null default '';

create table if not exists public.room_players (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms (id) on delete cascade,
  player_id text not null,
  name text not null,
  color text not null,
  is_host boolean not null default false,
  seat int not null,
  part_indexes int[] not null default '{}',
  created_at timestamptz not null default now(),
  unique (room_id, player_id)
);

create index if not exists rooms_code_idx on public.rooms (code);
create index if not exists room_players_room_id_idx on public.room_players (room_id);

alter table public.rooms enable row level security;
alter table public.room_players enable row level security;

-- プロトタイプ: anon から読み書き可（短いルームコード前提）
drop policy if exists rooms_select on public.rooms;
drop policy if exists rooms_insert on public.rooms;
drop policy if exists rooms_update on public.rooms;
drop policy if exists rooms_delete on public.rooms;
create policy rooms_select on public.rooms for select using (true);
create policy rooms_insert on public.rooms for insert with check (true);
create policy rooms_update on public.rooms for update using (true);
create policy rooms_delete on public.rooms for delete using (true);

drop policy if exists room_players_select on public.room_players;
drop policy if exists room_players_insert on public.room_players;
drop policy if exists room_players_update on public.room_players;
drop policy if exists room_players_delete on public.room_players;
create policy room_players_select on public.room_players for select using (true);
create policy room_players_insert on public.room_players for insert with check (true);
create policy room_players_update on public.room_players for update using (true);
create policy room_players_delete on public.room_players for delete using (true);

-- Realtime
do $$
begin
  begin
    alter publication supabase_realtime add table public.rooms;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table public.room_players;
  exception when duplicate_object then null;
  end;
end $$;
