-- =====================================================
-- LOGISTICS ENUMS: Add 'out' status and 'logistics' role
-- =====================================================
-- This migration adds new values to existing enums (if they exist)
-- Run this BEFORE the main logistics migration

-- =====================================================
-- 1. Add 'out' to unit_status enum (if enum exists)
-- =====================================================
-- If unit_status is a text column with CHECK constraint, this won't be needed
-- If it's an enum, uncomment and run:

-- DO $$ 
-- BEGIN
--   IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'unit_status') THEN
--     ALTER TYPE unit_status ADD VALUE IF NOT EXISTS 'out';
--   END IF;
-- END $$;

-- Note: If 'status' column in 'units' table is just TEXT without enum,
-- no action needed - 'out' will work automatically.

-- =====================================================
-- 2. Add 'logistics' to profile_role enum (if enum exists)
-- =====================================================
-- If role is a text column, this won't be needed
-- If it's an enum, uncomment and run:

-- DO $$ 
-- BEGIN
--   IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'profile_role') THEN
--     ALTER TYPE profile_role ADD VALUE IF NOT EXISTS 'logistics';
--   END IF;
-- END $$;

-- Note: If 'role' column in 'profiles' table is just TEXT,
-- no action needed - 'logistics' will work automatically.

-- =====================================================
-- 3. Verification queries (informational)
-- =====================================================
-- Check if unit_status is an enum:
-- SELECT typname, typtype FROM pg_type WHERE typname = 'unit_status';

-- Check if profile_role is an enum:
-- SELECT typname, typtype FROM pg_type WHERE typname = 'profile_role';

-- Check current allowed values for units.status column:
-- SELECT column_name, data_type, udt_name
-- FROM information_schema.columns 
-- WHERE table_name = 'units' AND column_name = 'status';

-- Check current allowed values for profiles.role column:
-- SELECT column_name, data_type, udt_name
-- FROM information_schema.columns 
-- WHERE table_name = 'profiles' AND column_name = 'role';

-- =====================================================
-- END OF MIGRATION
-- =====================================================
-- 
-- INSTRUCTIONS:
-- 1. Run verification queries above in Supabase SQL Editor
-- 2. If enum types exist, uncomment corresponding ALTER TYPE commands
-- 3. If using TEXT columns, skip this migration entirely
