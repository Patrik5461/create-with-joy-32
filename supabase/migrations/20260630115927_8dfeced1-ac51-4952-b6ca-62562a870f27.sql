
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS username text UNIQUE;
CREATE INDEX IF NOT EXISTS profiles_username_lower_idx ON public.profiles (lower(username));

-- Backfill admin user with username 'admin'
UPDATE public.profiles SET username = 'admin' WHERE email = 'admin@mimaproduction.sk' AND username IS NULL;
