-- Add hub_worker to user_role enum
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_enum e ON t.oid = e.enumtypid
    WHERE t.typname = 'user_role' AND e.enumlabel = 'hub_worker'
  ) THEN
    ALTER TYPE user_role ADD VALUE 'hub_worker';
  END IF;
END $$;
