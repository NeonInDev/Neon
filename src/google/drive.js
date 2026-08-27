const { novaConexao, isAuthenticated } = require("./auth");
const { log } = require("../logger");

function drive() {
  if (!isAuthenticated()) return null;
  return novaConexao("drive", "v3");
}

function simplificar(f) {
  return {
    id: f.id,
    nome: f.name,
    tipo: f.mimeType,
    tamanho: f.size ? `${(parseInt(f.size, 10) / 1048576).toFixed(1)} MB` : "",
    modificado: f.modifiedTime || "",
    link: f.webViewLink || "",
  };
}

async function listar(quantidade = 8) {
  const d = drive();
  if (!d) return { ok: false, erro: "Google nao autenticado" };
  try {
    const res = await d.files.list({
      pageSize: quantidade,
      orderBy: "modifiedTime desc",
      fields: "files(id,name,mimeType,size,modifiedTime,webViewLink)",
    });
    const arquivos = (res.data.files || []).map(simplificar);
    return { ok: true, arquivos };
  } catch (err) {
    log("WARN", "[GOOGLE:DRIVE] Erro ao listar", { erro: err.message });
    return { ok: false, erro: err.message };
  }
}

async function buscar(query) {
  const d = drive();
  if (!d) return { ok: false, erro: "Google nao autenticado" };
  try {
    const res = await d.files.list({
      q: `name contains '${String(query).replace(/'/g, "")}'`,
      pageSize: 8,
      orderBy: "modifiedTime desc",
      fields: "files(id,name,mimeType,size,modifiedTime,webViewLink)",
    });
    const arquivos = (res.data.files || []).map(simplificar);
    return { ok: true, arquivos };
  } catch (err) {
    return { ok: false, erro: err.message };
  }
}

async function linkPublico(fileId) {
  const d = drive();
  if (!d) return { ok: false, erro: "Google nao autenticado" };
  try {
    try {
      await d.permissions.create({
        fileId,
        requestBody: { role: "reader", type: "anyone" },
      });
    } catch {}
    const res = await d.files.get({ fileId, fields: "id,name,webViewLink,webContentLink" });
    return { ok: true, nome: res.data.name, link: res.data.webViewLink || res.data.webContentLink || "" };
  } catch (err) {
    return { ok: false, erro: err.message };
  }
}

module.exports = { listar, buscar, linkPublico };
