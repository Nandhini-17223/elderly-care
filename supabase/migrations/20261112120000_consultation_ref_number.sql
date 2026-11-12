-- Reference numbers: ABI-1001, ABI-1002, ...
CREATE SEQUENCE IF NOT EXISTS public.consultation_ref_seq START WITH 1001;

ALTER TABLE public.consultation_requests
  ADD COLUMN IF NOT EXISTS ref_number text;

-- Backfill existing rows in created_at order (stable by id)
WITH ordered AS (
  SELECT id,
         1000 + row_number() OVER (ORDER BY created_at ASC, id ASC) AS n
  FROM public.consultation_requests
  WHERE ref_number IS NULL
)
UPDATE public.consultation_requests c
SET ref_number = 'ABI-' || o.n::text
FROM ordered o
WHERE c.id = o.id;

-- Advance sequence past any assigned numbers
SELECT setval(
  'public.consultation_ref_seq',
  GREATEST(
    1000,
    COALESCE(
      (SELECT MAX(NULLIF(regexp_replace(ref_number, '^ABI-', ''), '')::int)
       FROM public.consultation_requests
       WHERE ref_number ~ '^ABI-[0-9]+$'),
      1000
    )
  )
);

ALTER TABLE public.consultation_requests
  ALTER COLUMN ref_number SET DEFAULT ('ABI-' || nextval('public.consultation_ref_seq')::text);

UPDATE public.consultation_requests
SET ref_number = 'ABI-' || nextval('public.consultation_ref_seq')::text
WHERE ref_number IS NULL;

ALTER TABLE public.consultation_requests
  ALTER COLUMN ref_number SET NOT NULL;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'consultation_requests_ref_number_key'
  ) THEN
    ALTER TABLE public.consultation_requests
      ADD CONSTRAINT consultation_requests_ref_number_key UNIQUE (ref_number);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS consultation_requests_ref_number_idx
  ON public.consultation_requests (ref_number);
