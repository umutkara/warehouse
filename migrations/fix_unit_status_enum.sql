-- =====================================================
-- FIX: unit_status enum - добавление новых значений
-- =====================================================
-- Эта миграция добавляет новые значения в enum unit_status:
-- - bin (вместо receiving)
-- - shipping (вместо shipped) 
-- - stored (вместо inventory_hold, если его нет)
--
-- Также проверяет и добавляет другие необходимые значения

DO $$ 
BEGIN
  -- Проверяем, существует ли enum unit_status
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'unit_status') THEN
    
    -- Добавляем 'bin' если его нет
    IF NOT EXISTS (
      SELECT 1 FROM pg_enum 
      WHERE enumlabel = 'bin' 
      AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'unit_status')
    ) THEN
      ALTER TYPE unit_status ADD VALUE IF NOT EXISTS 'bin';
    END IF;

    -- Добавляем 'shipping' если его нет
    IF NOT EXISTS (
      SELECT 1 FROM pg_enum 
      WHERE enumlabel = 'shipping' 
      AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'unit_status')
    ) THEN
      ALTER TYPE unit_status ADD VALUE IF NOT EXISTS 'shipping';
    END IF;

    -- Добавляем 'stored' если его нет (может быть вместо inventory_hold)
    IF NOT EXISTS (
      SELECT 1 FROM pg_enum 
      WHERE enumlabel = 'stored' 
      AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'unit_status')
    ) THEN
      ALTER TYPE unit_status ADD VALUE IF NOT EXISTS 'stored';
    END IF;

    -- Убеждаемся, что 'picking' есть
    IF NOT EXISTS (
      SELECT 1 FROM pg_enum 
      WHERE enumlabel = 'picking' 
      AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'unit_status')
    ) THEN
      ALTER TYPE unit_status ADD VALUE IF NOT EXISTS 'picking';
    END IF;

    -- Убеждаемся, что 'out' есть
    IF NOT EXISTS (
      SELECT 1 FROM pg_enum 
      WHERE enumlabel = 'out' 
      AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'unit_status')
    ) THEN
      ALTER TYPE unit_status ADD VALUE IF NOT EXISTS 'out';
    END IF;

    RAISE NOTICE 'Enum unit_status updated successfully';
  ELSE
    RAISE NOTICE 'Enum unit_status does not exist - column is likely TEXT type, no action needed';
  END IF;
END $$;

-- =====================================================
-- Проверка текущих значений enum (для отладки)
-- =====================================================
-- Раскомментируйте для проверки:
-- SELECT enumlabel 
-- FROM pg_enum 
-- WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'unit_status')
-- ORDER BY enumsortorder;
