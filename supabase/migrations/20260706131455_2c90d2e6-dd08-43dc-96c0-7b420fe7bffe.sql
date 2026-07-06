ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS work_email text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS job_title text;