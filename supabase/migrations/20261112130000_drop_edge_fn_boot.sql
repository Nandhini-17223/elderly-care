-- Remove runtime Edge Function bootloader table.
-- Edge Functions are deployed as self-contained bundles; no GitHub/DB blob loading.
DROP TABLE IF EXISTS public._edge_fn_boot;
