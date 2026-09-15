-- Temporary compatibility with the existing corrective UI, which still sends
-- "Media" in one online material-request path. New code should prefer "media".
ALTER TYPE public.corretiva_urgencia ADD VALUE IF NOT EXISTS 'Media';
