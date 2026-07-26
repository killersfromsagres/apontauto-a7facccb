import { useMemo } from "react";
import type { PointingJob } from "../types/pointing";

export type PointingMetrics = {
  queued: number;
  processing: number;
  review: number;
  completed: number;
  failed: number;
  cancelled: number;
  successRate: number | null;
  total: number;
};

export function computeMetrics(jobs: PointingJob[], sinceIso?: string): PointingMetrics {
  const since = sinceIso ? new Date(sinceIso).getTime() : null;
  const inPeriod = (job: PointingJob) =>
    since === null || new Date(job.finished_at ?? job.created_at).getTime() >= since;

  let queued = 0;
  let processing = 0;
  let review = 0;
  let completed = 0;
  let failed = 0;
  let cancelled = 0;

  for (const job of jobs) {
    switch (job.status) {
      case "queued":
        queued += 1;
        break;
      case "processing":
        processing += 1;
        break;
      case "review":
        review += 1;
        break;
      case "completed":
        if (inPeriod(job)) completed += 1;
        break;
      case "failed":
        if (inPeriod(job)) failed += 1;
        break;
      case "cancelled":
        if (inPeriod(job)) cancelled += 1;
        break;
    }
  }

  const finished = completed + failed;
  return {
    queued,
    processing,
    review,
    completed,
    failed,
    cancelled,
    successRate: finished > 0 ? completed / finished : null,
    total: jobs.length,
  };
}

export function usePointingMetrics(jobs: PointingJob[] | undefined, days: number) {
  return useMemo(() => {
    const since = new Date(Date.now() - days * 86_400_000).toISOString();
    return computeMetrics(jobs ?? [], since);
  }, [jobs, days]);
}
