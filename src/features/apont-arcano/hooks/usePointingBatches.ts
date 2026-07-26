import { useQuery } from "@tanstack/react-query";
import { listBatches, listJobsByBatch, listRecentJobs } from "../services/pointingService";

export const BATCHES_KEY = ["apont-arcano", "batches"] as const;
export const JOBS_KEY = ["apont-arcano", "jobs"] as const;

export function usePointingBatches() {
  return useQuery({
    queryKey: BATCHES_KEY,
    queryFn: () => listBatches(),
    refetchInterval: 25_000,
    staleTime: 5_000,
  });
}

export function useBatchJobs(batchId: string | null) {
  return useQuery({
    queryKey: [...JOBS_KEY, "batch", batchId],
    queryFn: () => listJobsByBatch(batchId as string),
    enabled: !!batchId,
    refetchInterval: 20_000,
    staleTime: 2_000,
  });
}

export function useRecentJobs() {
  return useQuery({
    queryKey: [...JOBS_KEY, "recent"],
    queryFn: () => listRecentJobs(),
    refetchInterval: 30_000,
    staleTime: 5_000,
  });
}
