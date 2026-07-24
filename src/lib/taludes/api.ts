import { supabase } from "@/integrations/supabase/client";

export interface Point {
  x: number; // 0..100 (% da largura)
  y: number; // 0..100 (% da altura)
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
}

async function requireUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error("Sessão expirada. Faça login novamente.");
  return data.user.id;
}

export async function uploadMapImage(file: File): Promise<{
  url: string;
  width: number;
  height: number;
}> {
  const form = new FormData();
  form.append("image", file);
  form.append("name", file.name);
  const res = await fetch("/api/public/imgbb-upload", { method: "POST", body: form });
  const json = await res.json();
  if (!res.ok) throw new Error(json?.error ?? `Falha no upload (${res.status})`);
  const url = json.url as string;
  const { width, height } = await readImageDimensions(file);
  return { url, width, height };
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
  patch: Partial<Pick<TaludeMap, "nome" | "observacao">>,
): Promise<void> {
  const { error } = await supabase.from("talude_maps").update(patch).eq("id", id);
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

export async function updateMarcacao(
  id: string,
  patch: Partial<Pick<TaludeMarcacao, "numero" | "data" | "rotulo" | "observacao" | "cor" | "polygon">>,
): Promise<void> {
  const payload = { ...patch, polygon: patch.polygon as unknown as never | undefined };
  if (patch.polygon === undefined) delete (payload as { polygon?: unknown }).polygon;
  const { error } = await supabase.from("talude_marcacoes").update(payload).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function deleteMarcacao(id: string): Promise<void> {
  const { error } = await supabase.from("talude_marcacoes").delete().eq("id", id);
  if (error) throw new Error(error.message);
}
