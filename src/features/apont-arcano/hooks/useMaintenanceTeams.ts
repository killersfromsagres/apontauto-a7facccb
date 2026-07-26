import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createTeam,
  deleteTeam,
  listTeams,
  updateTeam,
  type TeamInput,
} from "../services/pointingService";

export const TEAMS_KEY = ["apont-arcano", "teams"] as const;

export function useMaintenanceTeams() {
  const qc = useQueryClient();
  const query = useQuery({ queryKey: TEAMS_KEY, queryFn: listTeams, staleTime: 30_000 });

  const invalidate = () => qc.invalidateQueries({ queryKey: TEAMS_KEY });

  const create = useMutation({ mutationFn: (input: TeamInput) => createTeam(input), onSuccess: invalidate });
  const update = useMutation({
    mutationFn: ({ id, input }: { id: string; input: Partial<TeamInput> }) => updateTeam(id, input),
    onSuccess: invalidate,
  });
  const remove = useMutation({ mutationFn: (id: string) => deleteTeam(id), onSuccess: invalidate });

  return { ...query, create, update, remove };
}
