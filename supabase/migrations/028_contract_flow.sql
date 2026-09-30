-- Contract flow (Rachel, 2026-09-30): deal negotiated (advance sometimes first) → contract drawn up → Rach checks it
-- (strikes through, updates, flags for Clay) → set aside for Clay to review and sign → sent back → fully executed.
alter table public.agreements drop constraint if exists agreements_status_check;
alter table public.agreements add constraint agreements_status_check
  check (status in ('NOT_STARTED', 'NEGOTIATING', 'REQUESTED', 'RECEIVED', 'REVIEWED', 'WITH_CLAY', 'SIGNED', 'SENT_BACK', 'FULLY_EXECUTED', 'NOT_NEEDED'));
