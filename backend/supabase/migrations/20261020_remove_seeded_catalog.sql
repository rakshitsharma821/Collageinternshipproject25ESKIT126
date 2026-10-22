-- ==============================================================================
-- GadgetVerse Migration: 20261020_remove_seeded_catalog.sql
-- Goal: Remove the 19 legacy static seeded product rows from public.gadgets.
--
-- Safety Guarantees:
-- 1. Does NOT drop or alter public.gadgets table, columns, indexes, or RLS policies.
-- 2. Targets strictly the 19 known seed IDs originally loaded from data/gadgets.json.
-- 3. Any custom or newly tracked products created by users are left untouched.
-- ==============================================================================

DELETE FROM public.gadgets
WHERE id IN (
  'p1', 'p2', 'p3',
  'l1', 'l2', 'l3', 'l4', 'l5', 'l6',
  'w1', 'w2', 'w3',
  'e1', 'e2', 'e3',
  't1', 't2', 't3', 't4'
);

-- Verification Query (Run to confirm deletion of seed IDs):
-- SELECT count(*) AS remaining_seed_count FROM public.gadgets WHERE id IN ('p1','p2','p3','l1','l2','l3','l4','l5','l6','w1','w2','w3','e1','e2','e3','t1','t2','t3','t4');
