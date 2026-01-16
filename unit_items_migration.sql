-- Create unit_items table
-- ============================================

CREATE TABLE IF NOT EXISTS public.unit_items (
  unit_id uuid PRIMARY KEY REFERENCES public.units(id) ON DELETE CASCADE,
  title text,
  sku text,
  vendor text,
  image_url text,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Create trigger to auto-update updated_at
-- ============================================

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_unit_items_updated_at ON public.unit_items;

CREATE TRIGGER update_unit_items_updated_at
  BEFORE UPDATE ON public.unit_items
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Enable RLS
-- ============================================

ALTER TABLE public.unit_items ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- ============================================

-- SELECT policy: allow if unit belongs to user's warehouse
CREATE POLICY "Users can view items for units in their warehouse"
  ON public.unit_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.units u
      JOIN public.profiles p ON p.id = auth.uid()
      WHERE u.id = unit_items.unit_id
        AND u.warehouse_id = p.warehouse_id
    )
  );

-- INSERT policy: allow if unit belongs to user's warehouse
CREATE POLICY "Users can insert items for units in their warehouse"
  ON public.unit_items FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.units u
      JOIN public.profiles p ON p.id = auth.uid()
      WHERE u.id = unit_items.unit_id
        AND u.warehouse_id = p.warehouse_id
    )
  );

-- UPDATE policy: allow if unit belongs to user's warehouse
CREATE POLICY "Users can update items for units in their warehouse"
  ON public.unit_items FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM public.units u
      JOIN public.profiles p ON p.id = auth.uid()
      WHERE u.id = unit_items.unit_id
        AND u.warehouse_id = p.warehouse_id
    )
  );

-- Grant permissions
-- ============================================

GRANT SELECT, INSERT, UPDATE ON public.unit_items TO authenticated;

-- Add comment
COMMENT ON TABLE public.unit_items IS 'Product/item information associated with units. Warehouse-scoped via units table.';
