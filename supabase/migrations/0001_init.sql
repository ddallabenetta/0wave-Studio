-- 0wave Studio - initial schema.
--
-- Conflict strategy: last-write-wins on updated_at. Every table carries an
-- updated_at column maintained by the handle_updated_at() trigger; sync
-- clients write the whole project document and the newest updated_at wins
-- (see docs/DEPLOYMENT.md, section "Conflict strategy").
--
-- Run this file in the Supabase SQL editor. It is idempotent.

-- ---------------------------------------------------------------------------
-- Profiles: one row per authenticated user, owned by the user.
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Projects: the full project document (state_json) plus indexed columns.
-- state_json is the zod-validated Project document (schema v1).
-- ---------------------------------------------------------------------------

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null default 'Untitled Project',
  schema_version integer not null default 1,
  state_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Sounds: standalone sound definitions. project_id nullable so sounds can
-- outlive a project; deleting a project cascades to its sounds.
-- ---------------------------------------------------------------------------

create table if not exists public.sounds (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  project_id uuid references public.projects (id) on delete cascade,
  name text not null,
  sound_type text not null check (sound_type in ('synth', 'sample')),
  sound_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Audio assets: metadata for recorded/imported audio. Blobs live in the
-- private 'audio-assets' storage bucket (see supabase/storage.md); the
-- storage_path column records where each blob was uploaded.
-- ---------------------------------------------------------------------------

create table if not exists public.audio_assets (
  id uuid primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  project_id uuid references public.projects (id) on delete cascade,
  storage_path text not null,
  original_filename text,
  mime_type text,
  duration float8,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- updated_at maintenance: one function, one trigger per table.
-- ---------------------------------------------------------------------------

create or replace function public.handle_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
  before update on public.profiles
  for each row execute function public.handle_updated_at();

drop trigger if exists set_projects_updated_at on public.projects;
create trigger set_projects_updated_at
  before update on public.projects
  for each row execute function public.handle_updated_at();

drop trigger if exists set_sounds_updated_at on public.sounds;
create trigger set_sounds_updated_at
  before update on public.sounds
  for each row execute function public.handle_updated_at();

drop trigger if exists set_audio_assets_updated_at on public.audio_assets;
create trigger set_audio_assets_updated_at
  before update on public.audio_assets
  for each row execute function public.handle_updated_at();

-- ---------------------------------------------------------------------------
-- Indexes for the common query patterns: latest project per user, project
-- listings, and per-project child rows.
-- ---------------------------------------------------------------------------

create index if not exists projects_user_updated_idx
  on public.projects (user_id, updated_at desc);

create index if not exists sounds_project_idx
  on public.sounds (project_id);

create index if not exists audio_assets_project_idx
  on public.audio_assets (project_id);

-- ---------------------------------------------------------------------------
-- Row Level Security: every table is locked down; policies only expose the
-- authenticated user's own rows. All reads and writes go through auth.uid().
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.sounds enable row level security;
alter table public.audio_assets enable row level security;

-- Profiles: the row id is the auth user id.
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);
create policy "profiles_insert_own" on public.profiles
  for insert with check (auth.uid() = id);
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id);
create policy "profiles_delete_own" on public.profiles
  for delete using (auth.uid() = id);

-- Projects.
create policy "projects_select_own" on public.projects
  for select using (auth.uid() = user_id);
create policy "projects_insert_own" on public.projects
  for insert with check (auth.uid() = user_id);
create policy "projects_update_own" on public.projects
  for update using (auth.uid() = user_id);
create policy "projects_delete_own" on public.projects
  for delete using (auth.uid() = user_id);

-- Sounds.
create policy "sounds_select_own" on public.sounds
  for select using (auth.uid() = user_id);
create policy "sounds_insert_own" on public.sounds
  for insert with check (auth.uid() = user_id);
create policy "sounds_update_own" on public.sounds
  for update using (auth.uid() = user_id);
create policy "sounds_delete_own" on public.sounds
  for delete using (auth.uid() = user_id);

-- Audio assets.
create policy "audio_assets_select_own" on public.audio_assets
  for select using (auth.uid() = user_id);
create policy "audio_assets_insert_own" on public.audio_assets
  for insert with check (auth.uid() = user_id);
create policy "audio_assets_update_own" on public.audio_assets
  for update using (auth.uid() = user_id);
create policy "audio_assets_delete_own" on public.audio_assets
  for delete using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Grants: Supabase default privileges already cover the public schema, but
-- explicit grants keep the policy contract visible and idempotent. The anon
-- role gets nothing here: unauthenticated access is denied by RLS anyway.
-- ---------------------------------------------------------------------------

grant select, insert, update, delete on public.profiles to authenticated;
grant select, insert, update, delete on public.projects to authenticated;
grant select, insert, update, delete on public.sounds to authenticated;
grant select, insert, update, delete on public.audio_assets to authenticated;

-- ---------------------------------------------------------------------------
-- Documentation comments. Conflict strategy declared on every mutable table.
-- ---------------------------------------------------------------------------

comment on table public.profiles is
  'User profiles. Conflict strategy: last-write-wins on updated_at (see docs/DEPLOYMENT.md).';
comment on table public.projects is
  'Project documents as JSON (state_json). Conflict strategy: last-write-wins on updated_at.';
comment on table public.sounds is
  'Sound definitions. Conflict strategy: last-write-wins on updated_at.';
comment on table public.audio_assets is
  'Audio asset metadata; blobs live in the private audio-assets storage bucket. Conflict strategy: last-write-wins on updated_at.';
