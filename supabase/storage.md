# Supabase Storage: private audio assets

Audio blobs (recordings and imports) are stored in a **private** storage
bucket, never in a public bucket: files are only readable by the user who
owns them, and only through signed/authenticated access.

## 1. Create the bucket

```sql
-- Private bucket: file names are public metadata but objects require RLS.
insert into storage.buckets (id, name, public)
values ('audio-assets', 'audio-assets', false)
on conflict (id) do nothing;
```

This is a one-time setup step (or use the Supabase dashboard: Storage ->
New bucket -> name `audio-assets`, public = off).

## 2. Path convention

Objects are stored under:

```
{user_id}/{project_id}/{asset_id}
```

- `user_id`: the owning auth user's UUID (`auth.uid()`).
- `project_id`: the UUID of the owning project (`projects.id`).
- `asset_id`: the UUID of the asset (`audio_assets.id`).

The first path segment is the user id, which is exactly what the storage RLS
policies below key on: a user can only reach objects under their own folder,
so a guessed project/asset id leaks nothing.

## 3. Storage RLS policies (owner-only read/write)

Run these once, after creating the bucket:

```sql
-- Read: only the owner can download their own objects.
create policy "audio_assets_read_own" on storage.objects
  for select
  using (
    bucket_id = 'audio-assets'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Write (upload): only the owner can create objects in their own folder.
create policy "audio_assets_insert_own" on storage.objects
  for insert
  with check (
    bucket_id = 'audio-assets'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Update (overwrite): only the owner can replace their own objects.
create policy "audio_assets_update_own" on storage.objects
  for update
  using (
    bucket_id = 'audio-assets'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Delete: only the owner can remove their own objects.
create policy "audio_assets_delete_own" on storage.objects
  for delete
  using (
    bucket_id = 'audio-assets'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
```

Notes:

- `storage.foldername(name)` splits the object path; index `[1]` is the first
  segment, which is `auth.uid()` by the path convention above.
- Do not add an `anon` policy: unauthenticated users must never read or write
  audio assets.
- Deleting a project must clean up its storage folder `{user_id}/{project_id}/`
  as well; the app repository does this on `deleteProject` (database rows
  cascade via foreign keys, storage objects do not).

## 4. Upload limit

50 MB per audio asset, enforced client-side (the app rejects larger files
during Record and Import). The Supabase project may also enforce a lower
server-side limit via Storage -> Settings -> Max file size; keep it at or
above 50 MB or the client limit wins only on the client.
