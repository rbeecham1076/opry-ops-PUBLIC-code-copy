-- Opry Ops 1.0: show artwork. image_url holds the official show image (Cymbal/Etix cover photo).
alter table public.events add column if not exists image_url text;
