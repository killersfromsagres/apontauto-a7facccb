CREATE OR REPLACE FUNCTION public.pcm_fill_metrics()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'files', (SELECT count(*) FROM public.spreadsheet_jobs),
    'files_completed', (SELECT count(*) FROM public.spreadsheet_jobs WHERE status = 'completed'),
    'files_30d', (SELECT count(*) FROM public.spreadsheet_jobs WHERE created_at > now() - interval '30 days'),
    'rows_total', (SELECT coalesce(sum(total_rows), 0) FROM public.spreadsheet_jobs),
    'rows_matched', (SELECT coalesce(sum(matched_rows), 0) FROM public.spreadsheet_jobs),
    'rows_unmatched', (SELECT coalesce(sum(unmatched_rows), 0) FROM public.spreadsheet_jobs),
    'pending_unmatched', (SELECT count(*) FROM public.spreadsheet_unmatched WHERE status = 'pending'),
    'last_job_at', (SELECT max(created_at) FROM public.spreadsheet_jobs)
  );
$$;

GRANT EXECUTE ON FUNCTION public.pcm_fill_metrics() TO authenticated;
GRANT EXECUTE ON FUNCTION public.pcm_fill_metrics() TO service_role;