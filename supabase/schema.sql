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
  -- リレー: strict=しっかり / free=自由律。俳句・短歌は未使用（strict）
  shirazu_style text not null default 'strict'
    check (shirazu_style in ('strict', 'free')),
  -- 俳句・短歌: 結果発表まで自分の句以外を隠す
  kumo_gakure boolean not null default false,
  -- 次の一宴だけ、たまき等を完成させた人を破門する
  no_more_tmc boolean not null default false,
  created_at timestamptz not null default now(),
  -- 在室中だけ更新する。途切れた部屋は一覧から外し、行も消す
  last_seen timestamptz not null default now()
);

-- 既存 DB 向け（未追加なら実行）
alter table public.rooms
  add column if not exists theme text not null default '';

alter table public.rooms
  add column if not exists last_seen timestamptz not null default now();

alter table public.rooms
  add column if not exists shirazu_style text not null default 'strict';

alter table public.rooms
  add column if not exists kumo_gakure boolean not null default false;

-- 次の一宴だけ、たまき等を完成させた人を破門する
alter table public.rooms
  add column if not exists no_more_tmc boolean not null default false;

-- 超破門。この宴が終わり待機へ戻るまで、再参加できない
alter table public.rooms
  add column if not exists banned_player_ids text[] not null default '{}';

notify pgrst, 'reload schema';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'rooms_shirazu_style_check'
  ) then
    alter table public.rooms
      add constraint rooms_shirazu_style_check
      check (shirazu_style in ('strict', 'free'));
  end if;
end $$;

create table if not exists public.room_players (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms (id) on delete cascade,
  player_id text not null,
  name text not null,
  color text not null,
  is_host boolean not null default false,
  seat int not null,
  part_indexes int[] not null default '{}',
  role text not null default 'player'
    check (role in ('player', 'spectator')),
  created_at timestamptz not null default now(),
  unique (room_id, player_id)
);

-- 既存 DB 向け（未追加なら実行）
alter table public.room_players
  add column if not exists role text not null default 'player';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'room_players_role_check'
  ) then
    alter table public.room_players
      add constraint room_players_role_check
      check (role in ('player', 'spectator'));
  end if;
end $$;

create index if not exists rooms_code_idx on public.rooms (code);
create index if not exists room_players_room_id_idx on public.room_players (room_id);
-- 和室一覧（待機中の部屋を新しい順に取得）
create index if not exists rooms_phase_idx on public.rooms (phase, created_at desc);

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

-- 和室のコメント。部屋を消すと一緒に消える
create table if not exists public.room_chats (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms (id) on delete cascade,
  player_id text not null,
  name text not null,
  body text not null,
  created_at timestamptz not null default now(),
  constraint room_chats_name_len check (char_length(name) between 1 and 24),
  constraint room_chats_body_len check (char_length(body) between 1 and 40)
);

create index if not exists room_chats_room_created_idx
  on public.room_chats (room_id, created_at);

alter table public.room_chats enable row level security;

drop policy if exists room_chats_select on public.room_chats;
drop policy if exists room_chats_insert on public.room_chats;
create policy room_chats_select on public.room_chats for select using (true);
create policy room_chats_insert on public.room_chats for insert with check (true);

grant select, insert on public.room_chats to anon, authenticated;

do $$
begin
  begin
    alter publication supabase_realtime add table public.room_chats;
  exception when duplicate_object then null;
  end;
end $$;

notify pgrst, 'reload schema';
