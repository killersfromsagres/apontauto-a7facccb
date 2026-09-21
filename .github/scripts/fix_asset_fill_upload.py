from pathlib import Path

route = Path('src/routes/_authenticated/inteligencia-ativos.preencher.tsx')
text = route.read_text(encoding='utf-8')

old = '''              <Button
                size="lg"
                disabled={busy}
                onClick={() => inputRef.current?.click()}
                className="asset-fill-primary-action h-12 px-8 text-base font-semibold"
              >
                {busy ? (
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                ) : (
                  <Upload className="mr-2 h-5 w-5" />
                )}
                Selecionar arquivo
              </Button>
              <Button
                variant="outline"
                onClick={downloadTemplate}
                className="h-10 rounded-2xl border-primary/40 bg-background/60 backdrop-blur-md text-primary hover:bg-primary/10 transition-colors"
              >
                <FileSpreadsheet className="mr-2 h-4 w-4" /> Baixar modelo de planilha
              </Button>
              <p className="text-[11px] text-muted-foreground">
                O conteúdo da planilha é processado no seu navegador e nunca é enviado a serviços de
                IA.
              </p>
            </div>
          </LiquidPanel>
'''

new = '''              <Button
                type="button"
                size="lg"
                disabled={busy || catalogQuery.isLoading}
                onClick={() => inputRef.current?.click()}
                className="asset-fill-primary-action h-12 px-8 text-base font-semibold"
              >
                {busy || catalogQuery.isLoading ? (
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                ) : (
                  <Upload className="mr-2 h-5 w-5" />
                )}
                {catalogQuery.isLoading ? "Carregando base de ativos…" : busy ? "Lendo planilha…" : "Importar planilha"}
              </Button>
              <p className="text-[11px] text-muted-foreground">
                Após importar, o sistema identifica a coluna de ativo e prepara o preenchimento automático de Prédio, Andar e Ambiente.
              </p>
            </div>
            <div className="asset-fill-secondary-actions mt-4 flex flex-col items-center justify-between gap-3 rounded-xl border border-border/50 bg-background/30 px-4 py-3 text-left sm:flex-row">
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground">Precisa começar do zero?</p>
                <p className="text-xs text-muted-foreground">Baixe um modelo vazio apenas se você ainda não tiver uma planilha para importar.</p>
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={downloadTemplate}
                className="shrink-0 border-border/70 bg-background/50 text-foreground hover:border-primary/40 hover:bg-primary/5"
              >
                <FileSpreadsheet className="mr-2 h-4 w-4" /> Baixar modelo vazio
              </Button>
            </div>
          </LiquidPanel>
'''

if old not in text:
    raise SystemExit('Upload block not found; route changed and was left untouched.')

text = text.replace(old, new, 1)
route.write_text(text, encoding='utf-8')
