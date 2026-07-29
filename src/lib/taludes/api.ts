import { supabase } from "@/integrations/supabase/client";

export interface Point {
  x: number; // 0..100 (% da largura)
  y: number; // 0..100 (% da altura)
}

export interface CalibrationData {
  a: Point;
  b: Point;
  meters: number;
}

export interface TaludeMap {
  id: string;
  owner_id: string;
  nome: string;
  observacao: string | null;
  image_url: string;
  image_width: number;
  image_height: number;
  created_at: string;
  updated_at: string;
  calibration: CalibrationData | null;
  meters_per_unit: number | null;
  calibrated_at: string | null;
  calibrated_by: string | null;
}

export interface TaludeMarcacao {
  id: string;
  map_id: string;
  owner_id: string;
  numero: number;
  data: string; // YYYY-MM-DD
  rotulo: string | null;
  observacao: string | null;
  cor: string;
  polygon: Point[];
  created_at: string;
  updated_at: string;
  codigo: string | null;
  nome: string | null;
  setor: string | null;
  risco: string | null;
  inclinacao: number | null;
  tipo_solo: string | null;
  vegetacao: string | null;
  servico_atual: string | null;
  equipe: string | null;
  data_prevista: string | null;
  data_executada: string | null;
  estado_operacional: string | null;
  ultima_inspecao: string | null;
  proxima_inspecao: string | null;
  opacidade: number;
  ordem: number;
  bloqueado: boolean;
  visivel: boolean;
  rascunho: boolean;
}

export type MarcacaoPatch = Partial<Omit<TaludeMarcacao, "id" | "map_id" | "owner_id" | "created_at" | "updated_at">>;

export interface TaludeMapVersion {
  id: string;
  map_id: string;
  version_number: number;
  snapshot: { map: TaludeMap; marcacoes: TaludeMarcacao[] };
  reason: string | null;
  created_by: string | null;
  created_at: string;
}

export interface TaludeGeometryEvent {
  id: string;
  map_id: string;
  marcacao_id: string | null;
  action: string;
  old_polygon: Point[] | null;
  new_polygon: Point[] | null;
  created_by: string | null;
  created_at: string;
}

async function requireUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error("Sessão expirada. Faça login novamente.");
  return data.user.id;
}

const STORAGE_BUCKET = "talude-maps";

export async function uploadMapImage(file: File): Promise<{
  url: string;
  width: number;
  height: number;
}> {
  const owner_id = await requireUserId();
  const { width, height } = await readImageDimensions(file);
  const ext = (file.name.match(/\.([a-zA-Z0-9]+)$/)?.[1] ?? "png").toLowerCase();
  const path = `${owner_id}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(STORAGE_BUCKET).upload(path, file, {
    contentType: file.type || `image/${ext}`,
    upsert: false,
    cacheControl: "31536000",
  });
  if (error) {
    const msg = /exceeded|too large|payload/i.test(error.message)
      ? "Imagem excede o limite do servidor. Reduza levemente e tente novamente."
      : error.message;
    throw new Error(msg);
  }
  // Bucket é privado (públicos bloqueados no workspace). Usamos signed URL de longa duração.
  const { data, error: signErr } = await supabase.storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(path, 60 * 60 * 24 * 365);
  if (signErr || !data) throw new Error(signErr?.message || "Falha ao gerar URL da imagem");
  return { url: data.signedUrl, width, height };
}

function readImageDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
      URL.revokeObjectURL(objectUrl);
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Não foi possível ler a imagem"));
    };
    img.src = objectUrl;
  });
}


export async function listMaps(): Promise<TaludeMap[]> {
  const { data, error } = await supabase
    .from("talude_maps")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as TaludeMap[];
}

export async function createMap(input: {
  nome: string;
  observacao?: string;
  image_url: string;
  image_width: number;
  image_height: number;
}): Promise<TaludeMap> {
  const owner_id = await requireUserId();
  const { data, error } = await supabase
    .from("talude_maps")
    .insert({ ...input, owner_id, observacao: input.observacao ?? null })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as TaludeMap;
}

export async function updateMap(
  id: string,
  patch: Partial<Pick<TaludeMap, "nome" | "observacao" | "calibration" | "meters_per_unit" | "calibrated_at" | "calibrated_by">>,
): Promise<void> {
  const { error } = await supabase
    .from("talude_maps")
    .update(patch as never)
    .eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteMap(id: string): Promise<void> {
  const { error } = await supabase.from("talude_maps").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function listMarcacoes(map_id: string): Promise<TaludeMarcacao[]> {
  const { data, error } = await supabase
    .from("talude_marcacoes")
    .select("*")
    .eq("map_id", map_id)
    .order("numero", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as TaludeMarcacao[];
}

export async function createMarcacao(input: {
  map_id: string;
  numero: number;
  data: string;
  rotulo?: string | null;
  observacao?: string | null;
  cor: string;
  polygon: Point[];
}): Promise<TaludeMarcacao> {
  const owner_id = await requireUserId();
  const { data, error } = await supabase
    .from("talude_marcacoes")
    .insert({
      owner_id,
      map_id: input.map_id,
      numero: input.numero,
      data: input.data,
      rotulo: input.rotulo ?? null,
      observacao: input.observacao ?? null,
      cor: input.cor,
      polygon: input.polygon as unknown as never,
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as unknown as TaludeMarcacao;
}

export async function updateMarcacao(id: string, patch: MarcacaoPatch): Promise<void> {
  const payload = { ...patch, polygon: patch.polygon as unknown as never | undefined };
  if (patch.polygon === undefined) delete (payload as { polygon?: unknown }).polygon;
  const { error } = await supabase.from("talude_marcacoes").update(payload).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteMarcacao(id: string): Promise<void> {
  const { error } = await supabase.from("talude_marcacoes").delete().eq("id", id);
  if (error) throw new Error(error.message);
}


/* ======================= Criação com campos completos ======================= */

export async function createMarcacaoFull(
  map_id: string,
  input: MarcacaoPatch & { numero: number; data: string; cor: string; polygon: Point[] },
): Promise<TaludeMarcacao> {
  const owner_id = await requireUserId();
  const { data, error } = await supabase
    .from("talude_marcacoes")
    .insert({ ...(input as Record<string, unknown>), owner_id, map_id } as never)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as unknown as TaludeMarcacao;
}

/* ============================ Versões e histórico ============================ */

export async function listVersions(map_id: string): Promise<TaludeMapVersion[]> {
  const { data, error } = await supabase
    .from("talude_map_versions")
    .select("*")
    .eq("map_id", map_id)
    .order("version_number", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as TaludeMapVersion[];
}

export async function createVersion(
  map: TaludeMap,
  marcacoes: TaludeMarcacao[],
  reason: string,
): Promise<void> {
  const created_by = await requireUserId();
  const existing = await listVersions(map.id);
  const version_number = (existing[0]?.version_number ?? 0) + 1;
  const { error } = await supabase.from("talude_map_versions").insert({
    map_id: map.id,
    version_number,
    reason,
    created_by,
    snapshot: { map, marcacoes } as never,
  } as never);
  if (error) throw new Error(error.message);
}

/** Restaura uma versão: substitui todas as marcações do mapa pelo snapshot. */
export async function restoreVersion(version: TaludeMapVersion): Promise<void> {
  const owner_id = await requireUserId();
  const map_id = version.map_id;
  const current = await listMarcacoes(map_id);
  await createVersionFromCurrent(map_id, "Backup automático antes da restauração");
  if (current.length) {
    const { error } = await supabase.from("talude_marcacoes").delete().eq("map_id", map_id);
    if (error) throw new Error(error.message);
  }
  const rows = (version.snapshot?.marcacoes ?? []).map((m) => {
    const { created_at: _c, updated_at: _u, ...rest } = m;
    void _c;
    void _u;
    return { ...rest, owner_id, map_id };
  });
  if (rows.length) {
    const { error } = await supabase.from("talude_marcacoes").insert(rows as never);
    if (error) throw new Error(error.message);
  }
  await logGeometryEvent(map_id, null, `restore_v${version.version_number}`, null, null);
}

async function createVersionFromCurrent(map_id: string, reason: string): Promise<void> {
  const [{ data: mapRow }, marcacoes] = await Promise.all([
    supabase.from("talude_maps").select("*").eq("id", map_id).single(),
    listMarcacoes(map_id),
  ]);
  if (!mapRow) return;
  await createVersion(mapRow as unknown as TaludeMap, marcacoes, reason);
}

export async function logGeometryEvent(
  map_id: string,
  marcacao_id: string | null,
  action: string,
  old_polygon: Point[] | null,
  new_polygon: Point[] | null,
): Promise<void> {
  const created_by = await requireUserId();
  await supabase.from("talude_geometry_events").insert({
    map_id,
    marcacao_id,
    action,
    old_polygon: old_polygon as never,
    new_polygon: new_polygon as never,
    created_by,
  } as never);
}

export async function listGeometryEvents(map_id: string, limit = 100): Promise<TaludeGeometryEvent[]> {
  const { data, error } = await supabase
    .from("talude_geometry_events")
    .select("*")
    .eq("map_id", map_id)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as TaludeGeometryEvent[];
}
