-- Two work inboxes (person@example.com + person@example.com) can hold the same email.
-- dup_key identifies one conversation across accounts (sender + normalized subject + first message time);
-- the sync stores the first copy only and lists the other account in also_in, so nothing shows twice.
alter table public.communications
  add column if not exists dup_key text,
  add column if not exists also_in text[] default '{}';
create index if not exists communications_dup_key_idx on public.communications (dup_key) where dup_key is not null;
