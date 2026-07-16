import { supabase } from "@/integrations/supabase/client";

export type TaludeStatus = "programado" | "em_execucao" | "finalizado";

export type Point = { x: number; y: number }; // percentuais 0-100

export type TaludeMap = {
  id: string;
  owner_id: string;
  nome: string;
  image_path: string;
  image_width: number | null;
  image_height: number | null;
  periodicidade_dias: number;
};

export type Talude = {
  id: string;
  map_id: string;
  owner_id: string;
  numero: number;
  nome: string | null;
  status: TaludeStatus;
  polygon: Point[];
  data_programada: string | null;
  data_execucao: string | null;
  data_conclusao: string | null;
  proxima_data: string | null;
  periodicidade_dias: number | null;
  observacoes: string | null;
};

export const STATUS_META: Record<
  TaludeStatus,
  { label: string; hex: string; hexSoft: string; ring: string }
> = {
  programado: {
    label: "Programado",
    hex: "#3b82f6",
    hexSoft: "rgba(59,130,246,0.35)",
    ring: "rgba(59,130,246,0.9)",
  },
  em_execucao: {
    label: "Em Execução",
    hex: "#f59e0b",
    hexSoft: "rgba(245,158,11,0.4)",
    ring: "rgba(245,158,11,0.95)",
  },
  finalizado: {
    label: "Finalizado",
    hex: "#22c55e",
    hexSoft: "rgba(34,197,94,0.35)",
    ring: "rgba(34,197,94,0.9)",
  },
};

export function addDaysISO(iso: string, days: number): string {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function todayISO(): string {
  const d = new Date();
  const off = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - off).toISOString().slice(0, 10);
}

export function formatDateBR(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export function polygonCentroid(pts: Point[]): Point {
  if (pts.length === 0) return { x: 50, y: 50 };
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < pts.length; i++) {
    const p0 = pts[i];
    const p1 = pts[(i + 1) % pts.length];
    const cross = p0.x * p1.y - p1.x * p0.y;
    a += cross;
    cx += (p0.x + p1.x) * cross;
    cy += (p0.y + p1.y) * cross;
  }
  a *= 0.5;
  if (Math.abs(a) < 1e-6) {
    // fallback: média simples
    const sx = pts.reduce((s, p) => s + p.x, 0) / pts.length;
    const sy = pts.reduce((s, p) => s + p.y, 0) / pts.length;
    return { x: sx, y: sy };
  }
  return { x: cx / (6 * a), y: cy / (6 * a) };
}

// ============== API ==============

export async function fetchMaps(): Promise<TaludeMap[]> {
  const { data, error } = await supabase
    .from("talude_maps")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as TaludeMap[];
}

export async function fetchTaludes(mapId: string): Promise<Talude[]> {
  const { data, error } = await supabase
    .from("taludes")
    .select("*")
    .eq("map_id", mapId)
    .order("numero", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((t: any) => ({
    ...t,
    polygon: Array.isArray(t.polygon) ? (t.polygon as Point[]) : [],
  })) as Talude[];
}

export async function createMapFromFile(
  file: File,
  nome: string,
): Promise<TaludeMap> {
  const { data: s } = await supabase.auth.getSession();
  const uid = s.session?.user?.id;
  if (!uid) throw new Error("Sessão expirada.");

  const ext = file.name.split(".").pop()?.toLowerCase() || "png";
  const path = `${uid}/${crypto.randomUUID()}.${ext}`;

  const { error: upErr } = await supabase.storage
    .from("talude-maps")
    .upload(path, file, { upsert: false, contentType: file.type });
  if (upErr) throw upErr;

  // dimensões
  const dims = await readImageDims(file);

  const { data, error } = await supabase
    .from("talude_maps")
    .insert({
      owner_id: uid,
      nome,
      image_path: path,
      image_width: dims.w,
      image_height: dims.h,
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as TaludeMap;
}

export async function deleteMap(map: TaludeMap): Promise<void> {
  const { error } = await supabase.from("talude_maps").delete().eq("id", map.id);
  if (error) throw error;
  await supabase.storage.from("talude-maps").remove([map.image_path]);
}

export async function getSignedMapUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from("talude-maps")
    .createSignedUrl(path, 60 * 60);
  if (error) throw error;
  return data.signedUrl;
}

export async function createTalude(input: {
  map_id: string;
  numero: number;
  nome?: string | null;
  polygon: Point[];
  data_programada?: string | null;
  periodicidade_dias?: number | null;
}): Promise<Talude> {
  const { data: s } = await supabase.auth.getSession();
  const uid = s.session?.user?.id;
  if (!uid) throw new Error("Sessão expirada.");
  const { data, error } = await supabase
    .from("taludes")
    .insert({
      map_id: input.map_id,
      owner_id: uid,
      numero: input.numero,
      nome: input.nome ?? null,
      polygon: input.polygon as any,
      status: "programado",
      data_programada: input.data_programada ?? null,
      periodicidade_dias: input.periodicidade_dias ?? null,
    })
    .select("*")
    .single();
  if (error) throw error;
  return { ...(data as any), polygon: input.polygon } as Talude;
}

export async function updateTalude(
  id: string,
  patch: Partial<Omit<Talude, "id" | "map_id" | "owner_id">>,
): Promise<void> {
  const payload: any = { ...patch };
  if (patch.polygon) payload.polygon = patch.polygon as any;
  const { error } = await supabase.from("taludes").update(payload).eq("id", id);
  if (error) throw error;
}

export async function deleteTalude(id: string): Promise<void> {
  const { error } = await supabase.from("taludes").delete().eq("id", id);
  if (error) throw error;
}

function readImageDims(file: File): Promise<{ w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve({ w: img.naturalWidth, h: img.naturalHeight });
      URL.revokeObjectURL(url);
    };
    img.onerror = (e) => {
      URL.revokeObjectURL(url);
      reject(e);
    };
    img.src = url;
  });
}

// Validação de datas: prog <= exec <= concl
export function validateDates(t: {
  data_programada?: string | null;
  data_execucao?: string | null;
  data_conclusao?: string | null;
}): string | null {
  const { data_programada: p, data_execucao: e, data_conclusao: c } = t;
  if (p && e && e < p) return "Data de execução não pode ser anterior à data programada.";
  if (e && c && c < e) return "Data de conclusão não pode ser anterior à data de execução.";
  if (p && c && c < p) return "Data de conclusão não pode ser anterior à data programada.";
  return null;
}
