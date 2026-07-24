const $ = (id) => document.getElementById(id);

async function refresh() {
  const { credentials = {}, queue = [], history = [] } = await chrome.storage.local.get([
    "credentials", "queue", "history",
  ]);
  $("user").value = credentials.usuario || "";
  $("pass").value = credentials.senha || "";
  const pending = queue.filter((b) => b.status === "pending").length;
  $("status").innerHTML = pending
    ? `<b style="color:#10b981">${pending} lote(s) na fila.</b><br>Abra o Prisma4 e clique em "Executar próximo".`
    : `Fila vazia. Envie um lote pelo painel Apont Auto.`;
  const list = [...queue, ...history.slice(0, 10)];
  $("queue").innerHTML = list.length
    ? list.map((b) => {
        const cls = b.status === "done" ? "done" : b.status === "error" ? "err" : "pending";
        const label = b.status === "done" ? "Concluído" : b.status === "error" ? "Erro" : "Pendente";
        return `<div class="item"><span class="pill ${cls}">${label}</span>${b.os?.length || 0} OS · ${b.categoria || "—"}<br><span style="color:#71717a;font-size:10px">${new Date(b.enqueuedAt).toLocaleString("pt-BR")}</span></div>`;
      }).join("")
    : "";
}

$("save").addEventListener("click", async () => {
  const usuario = $("user").value.trim();
  const senha = $("pass").value;
  if (!usuario || !senha) { $("status").textContent = "Preencha usuário e senha."; return; }
  await chrome.storage.local.set({ credentials: { usuario, senha } });
  $("status").textContent = "Credenciais salvas localmente.";
});

$("open").addEventListener("click", () => {
  chrome.tabs.create({ url: "https://cimogps.com.br/Prisma4/AccountCustom/Login?ReturnUrl=%2fPrisma4" });
});

$("clear").addEventListener("click", async () => {
  await chrome.runtime.sendMessage({ type: "apontauto:clear-queue" });
  refresh();
});

chrome.storage.onChanged.addListener(refresh);
refresh();
