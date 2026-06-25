
-- Extend damaged_items to act as damage_reports for maintenance module
ALTER TABLE public.damaged_items
  ADD COLUMN IF NOT EXISTS severity TEXT NOT NULL DEFAULT 'medium',
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'new',
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS photo_paths TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS stock_applied BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS resolved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

ALTER TABLE public.damaged_items DROP CONSTRAINT IF EXISTS damaged_items_severity_chk;
ALTER TABLE public.damaged_items ADD CONSTRAINT damaged_items_severity_chk CHECK (severity IN ('light','medium','severe'));
ALTER TABLE public.damaged_items DROP CONSTRAINT IF EXISTS damaged_items_status_chk;
ALTER TABLE public.damaged_items ADD CONSTRAINT damaged_items_status_chk CHECK (status IN ('new','in_progress','resolved','retired'));

DROP TRIGGER IF EXISTS damaged_items_set_updated_at ON public.damaged_items;
CREATE TRIGGER damaged_items_set_updated_at BEFORE UPDATE ON public.damaged_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Trigger to keep furniture_items.damaged_qty / retired_qty in sync
CREATE OR REPLACE FUNCTION public.apply_damage_stock()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_apply_now BOOLEAN;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_apply_now := (NEW.severity = 'severe' AND NEW.status IN ('new','in_progress'));
    IF v_apply_now THEN
      UPDATE public.furniture_items SET damaged_qty = damaged_qty + NEW.qty WHERE id = NEW.furniture_item_id;
      NEW.stock_applied := true;
    ELSIF NEW.status = 'retired' THEN
      UPDATE public.furniture_items SET retired_qty = retired_qty + NEW.qty WHERE id = NEW.furniture_item_id;
      NEW.stock_applied := false;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- Revert previous stock effect if status moves out of damaged bucket
    IF OLD.stock_applied AND NEW.status IN ('resolved') THEN
      UPDATE public.furniture_items SET damaged_qty = GREATEST(0, damaged_qty - OLD.qty) WHERE id = NEW.furniture_item_id;
      NEW.stock_applied := false;
      NEW.resolved_at := COALESCE(NEW.resolved_at, now());
    ELSIF OLD.stock_applied AND NEW.status = 'retired' THEN
      UPDATE public.furniture_items
        SET damaged_qty = GREATEST(0, damaged_qty - OLD.qty),
            retired_qty = retired_qty + NEW.qty
        WHERE id = NEW.furniture_item_id;
      NEW.stock_applied := false;
      NEW.resolved_at := COALESCE(NEW.resolved_at, now());
    ELSIF NOT OLD.stock_applied AND OLD.status <> 'retired' AND NEW.status = 'retired' THEN
      -- Light/medium escalated to retired
      UPDATE public.furniture_items SET retired_qty = retired_qty + NEW.qty WHERE id = NEW.furniture_item_id;
      NEW.resolved_at := COALESCE(NEW.resolved_at, now());
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF OLD.stock_applied THEN
      UPDATE public.furniture_items SET damaged_qty = GREATEST(0, damaged_qty - OLD.qty) WHERE id = OLD.furniture_item_id;
    END IF;
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS damaged_items_apply_stock ON public.damaged_items;
CREATE TRIGGER damaged_items_apply_stock
  BEFORE INSERT OR UPDATE OR DELETE ON public.damaged_items
  FOR EACH ROW EXECUTE FUNCTION public.apply_damage_stock();

REVOKE EXECUTE ON FUNCTION public.apply_damage_stock() FROM PUBLIC, anon;

-- Storage policies for damage photos (reuse furniture-photos bucket, prefix 'damage/')
-- Existing policies on furniture-photos already allow authenticated users.

CREATE INDEX IF NOT EXISTS damaged_items_status_idx ON public.damaged_items(status);
CREATE INDEX IF NOT EXISTS damaged_items_furniture_item_idx ON public.damaged_items(furniture_item_id);
