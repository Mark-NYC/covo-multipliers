-- =============================================================================
-- Fix seat counting: count all applications, not just approved ones.
--
-- Previous formula: seats_remaining = capacity - approved_count
-- New formula:      seats_remaining = capacity - count(all applications)
--
-- Deleting a row from immersion_applications (e.g. after declining someone)
-- immediately restores that seat in the view.
-- =============================================================================

create or replace view immersions_with_availability as
select
  i.*,
  coalesce(stats.application_count, 0)                    as application_count,
  i.capacity - coalesce(stats.application_count, 0)       as seats_remaining,
  (i.capacity - coalesce(stats.application_count, 0)) > 0 as has_availability
from immersions i
left join (
  select
    immersion_id,
    count(*) as application_count
  from immersion_applications
  group by immersion_id
) stats on stats.immersion_id = i.id;
