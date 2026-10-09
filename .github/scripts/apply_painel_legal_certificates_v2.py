from pathlib import Path

# 1) Make legal reads rely on the real request first, refreshing the session only
# when the request itself reports an auth/network problem.
path = Path('src/lib/legal-items.ts')
text = path.read_text()

old = '''async function ensureLegalSession() {\n  const { data, error } = await supabase.auth.getSession();\n  if (error) throw error;\n  if (!data.session?.user) throw new Error("Sessão expirada. Entre novamente para carregar o Painel Legal.");\n}\n\nasync function withLegalReadRetry<T>(read: () => Promise<T>): Promise<T> {\n  await ensureLegalSession();\n  try {\n    return await read();\n  } catch (error) {\n    const message = legalErrorMessage(error);\n    const retryable = error instanceof TypeError || LEGAL_AUTH_RETRY_RE.test(message);\n    if (!retryable) throw error;\n    const { error: refreshError } = await supabase.auth.refreshSession();\n    if (refreshError) throw error;\n    return await read();\n  }\n}\n'''
new = '''async function withLegalReadRetry<T>(read: () => Promise<T>): Promise<T> {\n  try {\n    return await read();\n  } catch (error) {\n    const message = legalErrorMessage(error);\n    const retryable = error instanceof TypeError || LEGAL_AUTH_RETRY_RE.test(message);\n    if (!retryable) throw error;\n\n    const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();\n    if (refreshError || !refreshed.session) throw error;\n    return await read();\n  }\n}\n'''
if old not in text:
    raise SystemExit('auth block not found')
text = text.replace(old, new, 1)

# 2) Make the attachment row compatible with production projects that predate
# the is_current column.
text = text.replace('''  is_current: boolean | null;\n  created_at: string;\n};\n''', '''  is_current?: boolean | null;\n  created_at: string;\n};\n''', 1)

old = '''export async function listAttachments(itemId: string): Promise<LegalAttachment[]> {\n  return withLegalReadRetry(async () => {\n    const { data, error } = await supabase\n      .from("legal_item_attachments" as any)\n      .select("*")\n      .eq("item_id", itemId)\n      .order("is_current", { ascending: false })\n      .order("created_at", { ascending: false });\n    if (error) throw error;\n    return ((data as unknown as AttachmentRow[]) ?? []).map(fromAttachmentRow);\n  });\n}\n'''
new = '''export async function listAttachments(itemId: string): Promise<LegalAttachment[]> {\n  return withLegalReadRetry(async () => {\n    // Prefer the modern schema, preserving the explicit current/history marker.\n    const modern = await supabase\n      .from("legal_item_attachments" as any)\n      .select("id, item_id, storage_path, file_name, mime_type, size_bytes, is_current, created_at")\n      .eq("item_id", itemId)\n      .order("is_current", { ascending: false })\n      .order("created_at", { ascending: false });\n\n    if (!modern.error) {\n      return ((modern.data as unknown as AttachmentRow[]) ?? []).map(fromAttachmentRow);\n    }\n\n    // Some production environments still have the older attachment schema.\n    // The attachment counter only needs item_id and continues to work there,\n    // while querying/order by is_current fails. Fall back to legacy columns and\n    // infer the newest certificate as current so existing files remain usable.\n    const legacy = await supabase\n      .from("legal_item_attachments" as any)\n      .select("id, item_id, storage_path, file_name, mime_type, size_bytes, created_at");\n    if (legacy.error) throw modern.error;\n\n    const rows = ((legacy.data as unknown as AttachmentRow[]) ?? [])\n      .filter((row) => row.item_id === itemId)\n      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());\n\n    return rows.map((row, index) =>\n      fromAttachmentRow({ ...row, is_current: index === 0 }),\n    );\n  });\n}\n'''
if old not in text:
    raise SystemExit('listAttachments block not found')
text = text.replace(old, new, 1)
path.write_text(text)

# 3) Keep the modal diagnostic useful if production still rejects both shapes.
path = Path('src/components/legal/legal-attachments-modal.tsx')
text = path.read_text()
old = '''    data: attachments = [],\n    isLoading,\n    isError,\n    refetch,\n  } = useQuery({\n'''
new = '''    data: attachments = [],\n    isLoading,\n    isError,\n    error: attachmentsError,\n    refetch,\n  } = useQuery({\n'''
if old not in text:
    raise SystemExit('modal destructure block not found')
text = text.replace(old, new, 1)

text = text.replace('''    retry: 2,\n''', '''    retry: 1,\n''', 1)

old = '''                <p className="text-sm font-medium">Não foi possível carregar os certificados.</p>\n                <p className="mt-1 text-xs text-muted-foreground">Tente novamente sem sair deste item.</p>\n              </div>\n              <Button size="sm" variant="outline" onClick={() => void refetch()}>Tentar novamente</Button>\n'''
new = '''                <p className="text-sm font-medium">Não foi possível carregar os certificados.</p>\n                <p className="mt-1 text-xs text-muted-foreground">Tente novamente sem sair deste item.</p>\n                {attachmentsError && (\n                  <p className="mt-2 max-w-xl break-words text-[11px] text-destructive/80">\n                    {attachmentsError instanceof Error\n                      ? attachmentsError.message\n                      : String(attachmentsError)}\n                  </p>\n                )}\n              </div>\n              <Button size="sm" variant="outline" onClick={() => void refetch()}>Tentar novamente</Button>\n'''
if old not in text:
    raise SystemExit('modal error block not found')
text = text.replace(old, new, 1)
path.write_text(text)
