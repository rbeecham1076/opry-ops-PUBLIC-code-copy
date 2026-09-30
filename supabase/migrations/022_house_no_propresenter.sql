-- Free house nights (Gospel / Bluegrass / Classic Country) already run from a standing ProPresenter loop,
-- so they don't need the per-show "add / remove video and slides" steps. Artist shows keep them.
update public.workflow_rules set show_kinds = '{ARTIST}', updated_at = now() where code in ('K09', 'W05');

delete from public.tasks t using public.events e
 where t.event_id = e.id and public.show_kind(e.show_type) = 'HOUSE'
   and t.source_rule_id in ('K09', 'W05') and t.status not in ('COMPLETE', 'ARCHIVED');

update public.improvements set what_changed = 'House nights now track only concessions (ProPresenter already has a standing loop for them).'
 where what_changed = 'House nights now track only concessions and ProPresenter.';
