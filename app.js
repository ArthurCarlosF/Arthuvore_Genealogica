const API_URL = "https://script.google.com/macros/s/AKfycbymXf-sR4HNeR2DegyGwEQ00LD3i-POnVsHnfcBl5eN4GkzgKzR4geDlpSB8PQx0tGh5A/exec";
const SESSION_KEY = "arthuvore-session-v4";

let currentUser = null;
let allUsers = [];
let refreshTimer = null;

const $ = (selector) => document.querySelector(selector);
const els = {
  publicView: $("#public-view"),
  dashboard: $("#dashboard"),
  publicNav: $("#public-nav"),
  privateNav: $("#private-nav"),
  authDialog: $("#auth-dialog"),
  authForm: $("#auth-form"),
  authStatus: $("#auth-status"),
  treeSvg: $("#tree-svg"),
  treeEmpty: $("#tree-empty"),
  toast: $("#toast")
};

init();

async function init() {
  populateMonths();
  bindEvents();
  const token = localStorage.getItem(SESSION_KEY);
  if (!token) return showPublic();
  try {
    await loadAccount();
    showDashboard();
  } catch {
    localStorage.removeItem(SESSION_KEY);
    showPublic();
  }
}

function bindEvents() {
  document.querySelectorAll("[data-open-auth]").forEach((button) =>
    button.addEventListener("click", () => openAuth(button.dataset.openAuth))
  );
  document.querySelectorAll("[data-close-dialog]").forEach((button) =>
    button.addEventListener("click", () => button.closest("dialog").close())
  );
  document.querySelectorAll("[data-panel]").forEach((button) =>
    button.addEventListener("click", () => openPanel(button.dataset.panel))
  );
  $("#auth-switch").addEventListener("click", () =>
    openAuth(els.authForm.dataset.mode === "login" ? "register" : "login")
  );
  els.authForm.addEventListener("submit", submitAuth);
  $("#logout-button").addEventListener("click", logout);
  $("#degree-select").addEventListener("change", renderTree);
  $("#export-svg").addEventListener("click", exportTree);
  $("#profile-form").addEventListener("submit", saveProfile);
}

function populateMonths() {
  const months = [
    "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
    "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
  ];
  ["profile-month", "father-month", "mother-month"].forEach((id) => {
    const select = $(`#${id}`);
    months.forEach((name, index) => {
      const option = document.createElement("option");
      option.value = String(index + 1);
      option.textContent = name;
      select.append(option);
    });
  });
}

function openAuth(mode) {
  const register = mode === "register";
  els.authForm.dataset.mode = mode;
  $("#auth-register-fields").classList.toggle("hidden", !register);
  ["auth-name", "auth-father-name", "auth-mother-name", "auth-confirm-password"].forEach((id) => {
    $(`#${id}`).required = register;
  });
  $("#auth-password").autocomplete = register ? "new-password" : "current-password";
  $("#auth-eyebrow").textContent = register ? "Comece com três nomes" : "Bem-vindo de volta";
  $("#auth-title").textContent = register ? "Criar nova conta" : "Entrar na conta";
  $("#auth-submit").textContent = register ? "Criar minha conta" : "Entrar";
  $("#auth-switch").textContent = register ? "Já tenho uma conta" : "Ainda não tenho conta";
  setStatus(els.authStatus, "");
  if (!els.authDialog.open) els.authDialog.showModal();
}

async function submitAuth(event) {
  event.preventDefault();
  const mode = els.authForm.dataset.mode;
  const email = $("#auth-email").value.trim().toLowerCase();
  const password = $("#auth-password").value;
  const confirmPassword = $("#auth-confirm-password").value;

  if (mode === "register" && password !== confirmPassword) {
    return setStatus(els.authStatus, "As senhas informadas não coincidem.", "error");
  }

  setStatus(els.authStatus, mode === "register" ? "Criando conta..." : "Entrando...");
  try {
    const payload = mode === "register"
      ? {
          fullName: $("#auth-name").value.trim(),
          fatherName: $("#auth-father-name").value.trim(),
          motherName: $("#auth-mother-name").value.trim(),
          email,
          password
        }
      : { email, password };
    const result = await api(mode, payload, false);
    localStorage.setItem(SESSION_KEY, result.token);
    await loadAccount();
    showDashboard();
    els.authDialog.close();
    els.authForm.reset();
  } catch (error) {
    setStatus(els.authStatus, error.message, "error");
  }
}

async function logout() {
  try { await api("logout"); } catch {}
  localStorage.removeItem(SESSION_KEY);
  currentUser = null;
  clearInterval(refreshTimer);
  showPublic();
}

function showPublic() {
  els.publicView.classList.remove("hidden");
  els.dashboard.classList.add("hidden");
  els.publicNav.classList.remove("hidden");
  els.privateNav.classList.add("hidden");
}

function showDashboard() {
  els.publicView.classList.add("hidden");
  els.dashboard.classList.remove("hidden");
  els.publicNav.classList.add("hidden");
  els.privateNav.classList.remove("hidden");
  openPanel("tree-panel");
  renderAll();
  clearInterval(refreshTimer);
  refreshTimer = setInterval(() => loadAccount().catch(() => {}), 20000);
}

async function loadAccount() {
  const data = await api("bootstrap");
  currentUser = data.currentUser;
  allUsers = data.users;
  if (!els.dashboard.classList.contains("hidden")) renderAll();
}

function renderAll() {
  if (!currentUser) return;
  $("#sidebar-name").textContent = currentUser.fullName;
  $("#sidebar-avatar").textContent = initials(currentUser.fullName);
  $("#sidebar-meta").textContent = formatBirthDate(currentUser) || "Nascimento não informado";
  renderParentSummary("father", currentUser.fatherName, currentUser.fatherMatch);
  renderParentSummary("mother", currentUser.motherName, currentUser.motherMatch);
  renderAmbiguities();
  fillProfile();
  renderTree();
}

function openPanel(id) {
  document.querySelectorAll(".dashboard-panel").forEach((panel) =>
    panel.classList.toggle("hidden", panel.id !== id)
  );
  document.querySelectorAll("[data-panel]").forEach((button) =>
    button.classList.toggle("active", button.dataset.panel === id)
  );
}

function renderParentSummary(role, name, match) {
  const status = $(`#${role}-status`);
  const detail = $(`#${role}-detail`);
  status.textContent = name || (role === "father" ? "Não informado" : "Não informada");
  if (!name) return detail.textContent = "";
  if (match.status === "matched") detail.textContent = "Cadastro encontrado e conectado";
  else if (match.status === "ambiguous") detail.textContent = `${match.candidateCount} pessoas possíveis — informe mais dados`;
  else detail.textContent = "Perfil provisório — aguardando cadastro";
}

function renderAmbiguities() {
  const ambiguous = [];
  if (currentUser.fatherMatch?.status === "ambiguous") {
    ambiguous.push(`há mais de um ${currentUser.fatherName}`);
  }
  if (currentUser.motherMatch?.status === "ambiguous") {
    ambiguous.push(`há mais de uma ${currentUser.motherName}`);
  }
  $("#ambiguity-banner").classList.toggle("hidden", !ambiguous.length);
  $("#ambiguity-message").textContent = ambiguous.length
    ? `${ambiguous.join(" e ")}. Forneça mais dados do seu pai ou da sua mãe para encontrarmos a pessoa correta.`
    : "";
}

function fillProfile() {
  const values = {
    "profile-name": currentUser.fullName,
    "profile-year": currentUser.birthYear,
    "profile-month": currentUser.birthMonth,
    "profile-day": currentUser.birthDay,
    "profile-document": currentUser.document,
    "profile-email": currentUser.email,
    "father-name": currentUser.fatherName,
    "father-year": currentUser.fatherBirthYear,
    "father-month": currentUser.fatherBirthMonth,
    "father-day": currentUser.fatherBirthDay,
    "father-document": currentUser.fatherDocument,
    "mother-name": currentUser.motherName,
    "mother-year": currentUser.motherBirthYear,
    "mother-month": currentUser.motherBirthMonth,
    "mother-day": currentUser.motherBirthDay,
    "mother-document": currentUser.motherDocument
  };
  Object.entries(values).forEach(([id, value]) => { $(`#${id}`).value = value || ""; });
}

async function saveProfile(event) {
  event.preventDefault();
  const payload = {
    fullName: $("#profile-name").value.trim(),
    birthYear: optionalNumber("#profile-year"),
    birthMonth: optionalNumber("#profile-month"),
    birthDay: optionalNumber("#profile-day"),
    document: $("#profile-document").value.trim(),
    fatherName: $("#father-name").value.trim(),
    fatherBirthYear: optionalNumber("#father-year"),
    fatherBirthMonth: optionalNumber("#father-month"),
    fatherBirthDay: optionalNumber("#father-day"),
    fatherDocument: $("#father-document").value.trim(),
    motherName: $("#mother-name").value.trim(),
    motherBirthYear: optionalNumber("#mother-year"),
    motherBirthMonth: optionalNumber("#mother-month"),
    motherBirthDay: optionalNumber("#mother-day"),
    motherDocument: $("#mother-document").value.trim()
  };
  try {
    setStatus($("#profile-status"), "Salvando e recalculando...");
    await api("updateProfile", payload);
    await loadAccount();
    setStatus($("#profile-status"), "Dados atualizados e árvore recalculada.", "success");
    showToast("Dados atualizados.");
  } catch (error) {
    setStatus($("#profile-status"), error.message, "error");
  }
}

function buildGraph(maxDegree) {
  const root = allUsers.find((user) => user.id === currentUser.id) || currentUser;
  const nodes = new Map([[root.id, { ...root, degree: 0, kind: "person" }]]);
  const edges = [];
  const queue = [{ node: nodes.get(root.id), degree: 0 }];
  const visited = new Set([root.id]);

  while (queue.length) {
    const { node, degree } = queue.shift();
    if (degree >= maxDegree) continue;

    if (node.kind === "person") {
      ["father", "mother"].forEach((role) => {
        const name = node[`${role}Name`];
        const match = node[`${role}Match`];
        if (!name || !match) return;
        const parentNode = parentGraphNode(role, name, match, degree + 1);
        addGraphNode(nodes, queue, visited, parentNode, degree + 1);
        edges.push({ from: node.id, to: parentNode.id });
      });

      allUsers.forEach((child) => {
        ["father", "mother"].forEach((role) => {
          const match = child[`${role}Match`];
          if (match?.status === "matched" && match.userId === node.id) {
            const childNode = { ...child, degree: degree + 1, kind: "person" };
            addGraphNode(nodes, queue, visited, childNode, degree + 1);
            edges.push({ from: child.id, to: node.id });
          }
        });
      });
    } else {
      allUsers.forEach((child) => {
        const role = node.role;
        const match = child[`${role}Match`];
        const sameProvisional = match &&
          match.status === node.matchStatus &&
          match.normalizedName === node.normalizedName;
        if (sameProvisional) {
          const childNode = { ...child, degree: degree + 1, kind: "person" };
          addGraphNode(nodes, queue, visited, childNode, degree + 1);
          edges.push({ from: child.id, to: node.id });
        }
      });
    }
  }
  return { nodes: [...nodes.values()], edges: uniqueEdges(edges) };
}

function parentGraphNode(role, name, match, degree) {
  if (match.status === "matched") {
    const person = allUsers.find((user) => user.id === match.userId);
    if (person) return { ...person, degree, kind: "person" };
  }
  return {
    id: `${match.status}:${role}:${match.normalizedName}`,
    fullName: name,
    degree,
    kind: "placeholder",
    role,
    matchStatus: match.status,
    normalizedName: match.normalizedName,
    candidateCount: match.candidateCount || 0
  };
}

function addGraphNode(nodes, queue, visited, node, degree) {
  if (!nodes.has(node.id)) nodes.set(node.id, node);
  if (!visited.has(node.id)) {
    visited.add(node.id);
    queue.push({ node, degree });
  }
}

function renderTree() {
  if (!currentUser) return;
  const graph = buildGraph(Number($("#degree-select").value));
  els.treeEmpty.classList.toggle("hidden", graph.nodes.length > 1);
  const levels = new Map();
  graph.nodes.forEach((node) => {
    if (!levels.has(node.degree)) levels.set(node.degree, []);
    levels.get(node.degree).push(node);
  });
  const maxWidth = Math.max(...[...levels.values()].map((items) => items.length), 1);
  const width = Math.max(900, maxWidth * 190 + 120);
  const height = Math.max(540, levels.size * 165 + 90);
  els.treeSvg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  els.treeSvg.setAttribute("width", width);
  els.treeSvg.setAttribute("height", height);
  const positions = new Map();
  [...levels.entries()].sort(([a], [b]) => a - b).forEach(([level, items]) => {
    const spacing = width / (items.length + 1);
    items.forEach((node, index) => positions.set(node.id, { x: spacing * (index + 1), y: 85 + level * 155 }));
  });
  const edges = graph.edges.map((edge) => {
    const a = positions.get(edge.from), b = positions.get(edge.to);
    if (!a || !b) return "";
    return `<path class="tree-edge" d="M${a.x},${a.y + 48} C${a.x},${(a.y + b.y) / 2} ${b.x},${(a.y + b.y) / 2} ${b.x},${b.y - 48}"/>`;
  }).join("");
  const nodes = graph.nodes.map((node) => {
    const position = positions.get(node.id);
    if (node.kind === "placeholder") {
      const ambiguous = node.matchStatus === "ambiguous";
      const message = ambiguous
        ? `Há ${node.candidateCount} pessoas com este nome. Forneça mais dados.`
        : "Esta pessoa ainda não possui cadastro.";
      return `<g class="tree-node placeholder${ambiguous ? " ambiguous" : ""}" transform="translate(${position.x},${position.y})">
        <rect x="-68" y="-45" width="136" height="90" rx="16"/>
        <text class="question-mark" y="-13">?</text>
        <text class="node-name" y="8">${escapeHtml(shortName(node.fullName))}</text>
        <text class="node-meta" y="27">${ambiguous ? "Mais dados necessários" : "Perfil provisório"}</text>
        <title>${escapeHtml(message)}</title>
      </g>`;
    }
    return `<g class="tree-node${node.id === currentUser.id ? " focus" : ""}" transform="translate(${position.x},${position.y})">
      <circle r="54"/><text class="node-name" y="-4">${escapeHtml(shortName(node.fullName))}</text>
      <text class="node-meta" y="17">${escapeHtml(formatBirthDate(node) || "Data não informada")}</text>
      <title>${escapeHtml(node.fullName)}</title></g>`;
  }).join("");
  els.treeSvg.innerHTML = edges + nodes;
}

function exportTree() {
  if (!els.treeSvg.innerHTML) return showToast("Não há árvore para exportar.");
  const clone = els.treeSvg.cloneNode(true);
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  const style = document.createElementNS("http://www.w3.org/2000/svg", "style");
  style.textContent = `.tree-edge{fill:none;stroke:#9cb7ac;stroke-width:1.5}.tree-node circle{fill:#fff;stroke:#175244;stroke-width:3}.tree-node.focus circle{fill:#175244}.tree-node rect{fill:#f7f3e9;stroke:#ca9650;stroke-width:2;stroke-dasharray:5 4}.tree-node text{font-family:Arial;text-anchor:middle;fill:#173f35}.tree-node.focus text{fill:white}.node-name{font-size:12px;font-weight:bold}.node-meta{font-size:9px}.question-mark{font-size:17px;font-weight:bold}`;
  clone.prepend(style);
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)], { type: "image/svg+xml" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `arthuvore-${slugify(currentUser.fullName)}.svg`;
  link.click();
  URL.revokeObjectURL(url);
}

async function api(action, payload = {}, authenticated = true) {
  const token = authenticated ? localStorage.getItem(SESSION_KEY) : "";
  const response = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ action, token, payload })
  });
  const result = await response.json();
  if (!result.ok) throw new Error(result.error || "Não foi possível acessar o servidor.");
  return result.data;
}

function formatBirthDate(person) {
  if (!person?.birthYear) return "";
  if (!person.birthMonth) return String(person.birthYear);
  const month = String(person.birthMonth).padStart(2, "0");
  if (!person.birthDay) return `${month}/${person.birthYear}`;
  return `${String(person.birthDay).padStart(2, "0")}/${month}/${person.birthYear}`;
}

function optionalNumber(selector) {
  const value = $(selector).value;
  return value === "" ? "" : Number(value);
}

function uniqueEdges(edges) {
  const seen = new Set();
  return edges.filter((edge) => {
    const key = [edge.from, edge.to].sort().join("|");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function initials(name = "") {
  return name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
}

function shortName(name = "") {
  const parts = name.split(/\s+/);
  return parts.length > 1 ? `${parts[0]} ${parts.at(-1)}` : name;
}

function slugify(value) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

function escapeHtml(value = "") {
  const div = document.createElement("div");
  div.textContent = value;
  return div.innerHTML;
}

function setStatus(element, message, type = "") {
  element.textContent = message;
  element.className = `form-status ${type}`;
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => els.toast.classList.remove("show"), 3000);
}
