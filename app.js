const CONFIG_KEY = "raizes-config-v2";
const DEMO_KEY = "raizes-demo-data-v1";
const DEFAULT_API_URL = "https://script.google.com/macros/s/AKfycbymXf-sR4HNeR2DegyGwEQ00LD3i-POnVsHnfcBl5eN4GkzgKzR4geDlpSB8PQx0tGh5A/exec";
const DEMO_ADMIN_PASSWORD = "admin1234";

const demoPeople = [
  { id: "1", fullName: "Rafael Moreira", birthYear: 1988, document: "11111111111", fatherDocument: "33333333333", motherDocument: "22222222222", email: "rafael@exemplo.com", photoUrl: "", passwordHash: "demo" },
  { id: "2", fullName: "Marina Costa", birthYear: 1962, document: "22222222222", fatherDocument: "55555555555", motherDocument: "44444444444", email: "marina@exemplo.com", photoUrl: "", passwordHash: "demo" },
  { id: "3", fullName: "João Moreira", birthYear: 1959, document: "33333333333", fatherDocument: "77777777777", motherDocument: "66666666666", email: "joao@exemplo.com", photoUrl: "", passwordHash: "demo" },
  { id: "4", fullName: "Alzira Nogueira Costa", birthYear: 1935, document: "44444444444", fatherDocument: "", motherDocument: "", email: "alzira@exemplo.com", photoUrl: "", passwordHash: "demo" },
  { id: "5", fullName: "Carlos Costa", birthYear: 1932, document: "55555555555", fatherDocument: "", motherDocument: "", email: "carlos@exemplo.com", photoUrl: "", passwordHash: "demo" },
  { id: "6", fullName: "Helena Moreira", birthYear: 1936, document: "66666666666", fatherDocument: "", motherDocument: "", email: "helena@exemplo.com", photoUrl: "", passwordHash: "demo" },
  { id: "7", fullName: "Antônio Moreira", birthYear: 1930, document: "77777777777", fatherDocument: "", motherDocument: "", email: "antonio@exemplo.com", photoUrl: "", passwordHash: "demo" },
  { id: "8", fullName: "Bianca Moreira", birthYear: 1992, document: "88888888888", fatherDocument: "33333333333", motherDocument: "22222222222", email: "bianca@exemplo.com", photoUrl: "", passwordHash: "demo" }
];

const state = {
  people: [],
  selectedId: null,
  editingId: null,
  photoData: "",
  config: loadConfig()
};

const $ = (selector) => document.querySelector(selector);
const els = {
  peopleList: $("#people-list"),
  searchInput: $("#search-input"),
  resultCount: $("#result-count"),
  peopleCount: $("#people-count"),
  familyCount: $("#family-count"),
  treeSection: $("#arvore"),
  treeSvg: $("#tree-svg"),
  treeEmpty: $("#tree-empty"),
  treeTitle: $("#tree-title"),
  form: $("#person-form"),
  formStatus: $("#form-status"),
  settings: $("#settings-dialog"),
  apiUrl: $("#api-url"),
  demoMode: $("#demo-mode"),
  passwordDialog: $("#password-dialog"),
  passwordStatus: $("#password-status"),
  toast: $("#toast")
};

document.addEventListener("DOMContentLoaded", init);

async function init() {
  bindEvents();
  els.apiUrl.value = state.config.apiUrl || "";
  els.demoMode.checked = state.config.demoMode;
  await refreshPeople();
}

function bindEvents() {
  $("#search-button").addEventListener("click", renderPeople);
  els.searchInput.addEventListener("input", renderPeople);
  $("#generate-tree").addEventListener("click", renderTree);
  $("#degree-select").addEventListener("change", () => state.selectedId && renderTree());
  $("#export-svg").addEventListener("click", exportTreeSvg);
  $("#open-settings").addEventListener("click", () => els.settings.showModal());
  $("#save-settings").addEventListener("click", saveSettings);
  $("#photo").addEventListener("change", handlePhoto);
  els.form.addEventListener("submit", savePerson);
  $("#cancel-edit").addEventListener("click", resetForm);
  $("#confirm-edit").addEventListener("click", confirmEdit);
}

function loadConfig() {
  try {
    return {
      apiUrl: DEFAULT_API_URL,
      demoMode: false,
      ...JSON.parse(localStorage.getItem(CONFIG_KEY) || "{}")
    };
  } catch {
    return { apiUrl: DEFAULT_API_URL, demoMode: false };
  }
}

function saveSettings(event) {
  event.preventDefault();
  const apiUrl = els.apiUrl.value.trim();
  const demoMode = els.demoMode.checked;
  if (!demoMode && !/^https:\/\/script\.google\.com\/macros\/s\/.+\/exec$/.test(apiUrl)) {
    showToast("Informe uma URL válida do Apps Script ou ative o modo demonstração.");
    return;
  }
  state.config = { apiUrl, demoMode };
  localStorage.setItem(CONFIG_KEY, JSON.stringify(state.config));
  els.settings.close();
  refreshPeople();
}

async function refreshPeople() {
  setStatus("Carregando pessoas...");
  try {
    state.people = await apiRequest("list");
    renderPeople();
    updateStats();
    setStatus("");
  } catch (error) {
    setStatus(error.message, "error");
    showToast(error.message);
  }
}

async function apiRequest(action, payload = {}) {
  if (state.config.demoMode) return demoApi(action, payload);
  if (!state.config.apiUrl) throw new Error("Configure a URL do Apps Script.");
  const response = await fetch(state.config.apiUrl, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ action, payload })
  });
  if (!response.ok) throw new Error("Não foi possível acessar o Apps Script.");
  const data = await response.json();
  if (!data.ok) throw new Error(data.error || "A API recusou a operação.");
  return data.data;
}

function demoApi(action, payload) {
  let people = JSON.parse(localStorage.getItem(DEMO_KEY) || "null") || structuredClone(demoPeople);
  if (!localStorage.getItem(DEMO_KEY)) localStorage.setItem(DEMO_KEY, JSON.stringify(people));
  if (action === "list") return people.map(publicPerson);
  if (action === "create") {
    if (people.some((p) => normalizeDoc(p.document) === normalizeDoc(payload.document))) throw new Error("Este documento já está cadastrado.");
    const person = {
      ...payload,
      id: crypto.randomUUID(),
      photoUrl: payload.photoData || "",
      passwordHash: simpleHash(payload.password),
      createdAt: new Date().toISOString()
    };
    delete person.password;
    delete person.photoData;
    people.push(person);
    localStorage.setItem(DEMO_KEY, JSON.stringify(people));
    return publicPerson(person);
  }
  if (action === "verify") {
    const person = people.find((p) => p.id === payload.id);
    return Boolean(person && (
      payload.password === DEMO_ADMIN_PASSWORD ||
      person.passwordHash === simpleHash(payload.password) ||
      person.passwordHash === "demo" && payload.password === "demo1234"
    ));
  }
  if (action === "update") {
    const index = people.findIndex((p) => p.id === payload.id);
    if (index < 0) throw new Error("Cadastro não encontrado.");
    const authorized = payload.password === DEMO_ADMIN_PASSWORD ||
      people[index].passwordHash === simpleHash(payload.password) ||
      people[index].passwordHash === "demo" && payload.password === "demo1234";
    if (!authorized) throw new Error("Senha individual ou administrativa incorreta.");
    const passwordHash = payload.newPassword ? simpleHash(payload.newPassword) : people[index].passwordHash;
    people[index] = {
      ...people[index],
      ...payload,
      photoUrl: payload.photoData || people[index].photoUrl || "",
      passwordHash,
      updatedAt: new Date().toISOString()
    };
    delete people[index].password;
    delete people[index].newPassword;
    delete people[index].photoData;
    localStorage.setItem(DEMO_KEY, JSON.stringify(people));
    return publicPerson(people[index]);
  }
  throw new Error("Operação desconhecida.");
}

function publicPerson(person) {
  const { passwordHash, password, ...safe } = person;
  return safe;
}

function simpleHash(value) {
  let hash = 0;
  for (const char of value) hash = (hash << 5) - hash + char.charCodeAt(0) | 0;
  return String(hash);
}

function normalizeDoc(value = "") {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function renderPeople() {
  const term = els.searchInput.value.trim().toLocaleLowerCase("pt-BR");
  const normalizedTerm = normalizeDoc(term);
  const filtered = state.people.filter((person) => {
    const name = person.fullName.toLocaleLowerCase("pt-BR");
    return !term || name.includes(term) || normalizeDoc(person.document).includes(normalizedTerm);
  });
  els.resultCount.textContent = `${filtered.length} ${filtered.length === 1 ? "resultado" : "resultados"}`;
  els.peopleList.replaceChildren();
  if (!filtered.length) {
    els.peopleList.innerHTML = '<div class="empty-results">Nenhuma pessoa encontrada com esse filtro.</div>';
    return;
  }
  filtered.forEach((person) => els.peopleList.append(personCard(person)));
}

function personCard(person) {
  const card = document.createElement("article");
  card.className = `person-card${state.selectedId === person.id ? " selected" : ""}`;
  card.innerHTML = `
    <div class="person-card-header">
      ${avatarHtml(person)}
      <div>
        <h3 title="${escapeHtml(person.fullName)}">${escapeHtml(person.fullName)}</h3>
        <p>${escapeHtml(String(person.birthYear || "Ano desconhecido"))} · ${maskDocument(person.document)}</p>
      </div>
    </div>
    <div class="person-card-actions">
      <button class="card-link select-person" type="button">Ver árvore</button>
      <button class="card-link edit-person" type="button">Editar</button>
    </div>`;
  card.querySelector(".select-person").addEventListener("click", () => selectPerson(person.id));
  card.querySelector(".edit-person").addEventListener("click", () => requestEdit(person.id));
  return card;
}

function avatarHtml(person) {
  if (person.photoUrl) return `<img class="avatar" src="${escapeAttribute(person.photoUrl)}" alt="">`;
  return `<div class="avatar">${initials(person.fullName)}</div>`;
}

function selectPerson(id) {
  state.selectedId = id;
  renderPeople();
  els.treeSection.classList.remove("hidden");
  renderTree();
  els.treeSection.scrollIntoView({ behavior: "smooth", block: "start" });
}

function buildGraph(root, maxDegree) {
  const byDocument = new Map(state.people.map((p) => [normalizeDoc(p.document), p]));
  const nodes = new Map([[root.id, { ...root, degree: 0 }]]);
  const edges = [];
  const queue = [{ person: root, degree: 0 }];
  const visited = new Set([root.id]);

  while (queue.length) {
    const { person, degree } = queue.shift();
    if (degree >= maxDegree) continue;
    const relations = [
      { doc: person.fatherDocument, type: "pai" },
      { doc: person.motherDocument, type: "mãe" }
    ];
    for (const relation of relations) {
      if (!relation.doc) continue;
      const related = byDocument.get(normalizeDoc(relation.doc));
      if (related) {
        edges.push({ from: person.id, to: related.id, type: relation.type });
        if (!visited.has(related.id)) {
          visited.add(related.id);
          nodes.set(related.id, { ...related, degree: degree + 1 });
          queue.push({ person: related, degree: degree + 1 });
        }
      } else {
        const missingId = `missing-${normalizeDoc(relation.doc)}`;
        nodes.set(missingId, {
          id: missingId,
          fullName: `${capitalize(relation.type)} não cadastrado`,
          document: relation.doc,
          degree: degree + 1,
          missing: true,
          missingKind: "parent"
        });
        edges.push({ from: person.id, to: missingId, type: relation.type });
      }
    }

    const registeredChildren = state.people.filter((child) =>
      [child.fatherDocument, child.motherDocument]
        .some((doc) => normalizeDoc(doc) === normalizeDoc(person.document))
    );

    for (const child of registeredChildren) {
      edges.push({ from: child.id, to: person.id, type: "filho" });
      if (!visited.has(child.id)) {
        visited.add(child.id);
        nodes.set(child.id, { ...child, degree: degree + 1 });
        queue.push({ person: child, degree: degree + 1 });
      }
    }

    if (!registeredChildren.length) {
      const missingChildId = `missing-child-${person.id}`;
      nodes.set(missingChildId, {
        id: missingChildId,
        fullName: "Filho não cadastrado",
        degree: degree + 1,
        missing: true,
        missingKind: "child"
      });
      edges.push({ from: missingChildId, to: person.id, type: "filho" });
    }
  }
  return { nodes: [...nodes.values()], edges: uniqueEdges(edges).filter((e) => nodes.has(e.from) && nodes.has(e.to)) };
}

function renderTree() {
  const root = state.people.find((person) => person.id === state.selectedId);
  if (!root) return showToast("Selecione uma pessoa primeiro.");
  const degree = Number($("#degree-select").value);
  const graph = buildGraph(root, degree);
  els.treeTitle.textContent = `Árvore de ${root.fullName}`;
  els.treeEmpty.classList.add("hidden");

  const levels = new Map();
  graph.nodes.forEach((node) => {
    if (!levels.has(node.degree)) levels.set(node.degree, []);
    levels.get(node.degree).push(node);
  });
  const maxOnLevel = Math.max(...[...levels.values()].map((items) => items.length), 1);
  const width = Math.max(900, maxOnLevel * 190 + 120);
  const height = Math.max(570, levels.size * 175 + 100);
  els.treeSvg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  els.treeSvg.setAttribute("width", width);
  els.treeSvg.setAttribute("height", height);

  const positions = new Map();
  [...levels.entries()].sort(([a], [b]) => a - b).forEach(([level, items]) => {
    const y = 90 + level * 165;
    const spacing = width / (items.length + 1);
    items.forEach((node, index) => positions.set(node.id, { x: spacing * (index + 1), y }));
  });

  const edgeMarkup = graph.edges.map((edge) => {
    const a = positions.get(edge.from);
    const b = positions.get(edge.to);
    if (!a || !b) return "";
    const midY = (a.y + b.y) / 2;
    return `<path class="tree-edge" d="M ${a.x} ${a.y + 48} C ${a.x} ${midY}, ${b.x} ${midY}, ${b.x} ${b.y - 48}"/>`;
  }).join("");

  const nodeMarkup = graph.nodes.map((node) => {
    const { x, y } = positions.get(node.id);
    if (node.missing) {
      const tooltip = node.missingKind === "child"
        ? "Nenhum filho desta pessoa está cadastrado na base"
        : `${node.fullName}: documento ${maskDocument(node.document)}`;
      return `<g class="tree-node missing" transform="translate(${x},${y})">
        <title>${escapeHtml(tooltip)}</title>
        <rect x="-67" y="-42" width="134" height="84" rx="16"/>
        <text class="node-name" y="-7">?</text>
        <text class="node-meta" y="14">${escapeHtml(node.fullName)}</text>
      </g>`;
    }
    const focus = node.id === root.id ? " focus" : "";
    return `<g class="tree-node${focus}" data-id="${escapeAttribute(node.id)}" transform="translate(${x},${y})">
      <title>${escapeHtml(node.fullName)}, ${escapeHtml(String(node.birthYear || "ano desconhecido"))}</title>
      <circle r="55"/>
      <text class="node-name" y="-4">${escapeHtml(shortName(node.fullName))}</text>
      <text class="node-meta" y="16">${escapeHtml(String(node.birthYear || "—"))}</text>
    </g>`;
  }).join("");

  els.treeSvg.innerHTML = `<g>${edgeMarkup}${nodeMarkup}</g>`;
  els.treeSvg.querySelectorAll("[data-id]").forEach((node) => node.addEventListener("click", () => selectPerson(node.dataset.id)));
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

function exportTreeSvg() {
  if (!els.treeSvg.innerHTML) return showToast("Gere uma árvore antes de exportar.");
  const clone = els.treeSvg.cloneNode(true);
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  const style = document.createElementNS("http://www.w3.org/2000/svg", "style");
  style.textContent = `.tree-edge{fill:none;stroke:#a8bdb2;stroke-width:1.5}.tree-node circle{fill:#fffdf8;stroke:#154f41;stroke-width:3}.tree-node.focus circle{fill:#154f41}.tree-node.focus text{fill:white}.tree-node.missing rect{fill:#f8f5ed;stroke:#cf9b53;stroke-width:2;stroke-dasharray:6 4}.tree-node text{fill:#173f35;font-family:Arial;text-anchor:middle}.node-name{font-size:12px;font-weight:700}.node-meta{fill:#557168;font-size:10px}`;
  clone.prepend(style);
  const blob = new Blob([new XMLSerializer().serializeToString(clone)], { type: "image/svg+xml" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `arvore-${slugify(els.treeTitle.textContent)}.svg`;
  link.click();
  URL.revokeObjectURL(link.href);
}

async function handlePhoto(event) {
  const file = event.target.files[0];
  if (!file) return;
  if (file.size > 2 * 1024 * 1024) {
    event.target.value = "";
    return showToast("A foto deve ter no máximo 2 MB.");
  }
  state.photoData = await readFile(file);
  $("#photo-preview").innerHTML = `<img src="${state.photoData}" alt="Prévia da foto">`;
}

async function savePerson(event) {
  event.preventDefault();
  const values = Object.fromEntries(new FormData(els.form).entries());
  const payload = {
    fullName: values.fullName.trim(),
    birthYear: Number(values.birthYear),
    document: normalizeDoc(values.document),
    fatherDocument: normalizeDoc(values.fatherDocument),
    motherDocument: normalizeDoc(values.motherDocument),
    email: values.email.trim().toLowerCase(),
    photoData: state.photoData
  };
  if ([payload.fatherDocument, payload.motherDocument].includes(payload.document)) {
    return setStatus("O documento da pessoa não pode ser igual ao de um dos pais.", "error");
  }
  try {
    setStatus("Salvando...");
    if (state.editingId) {
      payload.id = state.editingId;
      payload.password = els.form.dataset.editPassword;
      payload.newPassword = values.password;
      await apiRequest("update", payload);
    } else {
      payload.password = values.password;
      await apiRequest("create", payload);
    }
    setStatus("Cadastro salvo com sucesso.", "success");
    resetForm();
    await refreshPeople();
    showToast("Pessoa salva e conexões atualizadas.");
  } catch (error) {
    setStatus(error.message, "error");
  }
}

function requestEdit(id) {
  state.editingId = id;
  $("#edit-password").value = "";
  els.passwordStatus.textContent = "";
  els.passwordDialog.showModal();
}

async function confirmEdit(event) {
  event.preventDefault();
  const password = $("#edit-password").value;
  try {
    const valid = await apiRequest("verify", { id: state.editingId, password });
    if (!valid) throw new Error("Senha incorreta.");
    const person = state.people.find((p) => p.id === state.editingId);
    fillForm(person, password);
    els.passwordDialog.close();
    $("#cadastro").scrollIntoView({ behavior: "smooth" });
  } catch (error) {
    els.passwordStatus.textContent = error.message;
    els.passwordStatus.className = "form-status error";
  }
}

function fillForm(person, password) {
  $("#record-id").value = person.id;
  $("#full-name").value = person.fullName;
  $("#birth-year").value = person.birthYear;
  $("#document").value = person.document;
  $("#father-document").value = person.fatherDocument || "";
  $("#mother-document").value = person.motherDocument || "";
  $("#email").value = person.email;
  $("#password").value = "";
  $("#password").required = false;
  $("#password").placeholder = "Deixe vazio para manter a senha";
  $("#consent").checked = true;
  els.form.dataset.editPassword = password;
  $("#cancel-edit").classList.remove("hidden");
  if (person.photoUrl) $("#photo-preview").innerHTML = `<img src="${escapeAttribute(person.photoUrl)}" alt="">`;
}

function resetForm() {
  els.form.reset();
  state.editingId = null;
  state.photoData = "";
  delete els.form.dataset.editPassword;
  $("#password").required = true;
  $("#password").placeholder = "Mínimo de 8 caracteres";
  $("#cancel-edit").classList.add("hidden");
  $("#photo-preview").innerHTML = "<span>+</span>";
}

function updateStats() {
  els.peopleCount.textContent = state.people.length;
  const docs = new Set(state.people.map((p) => normalizeDoc(p.document)));
  const adjacency = new Map([...docs].map((doc) => [doc, new Set()]));
  state.people.forEach((p) => [p.fatherDocument, p.motherDocument].filter(Boolean).forEach((parentDoc) => {
    const childDoc = normalizeDoc(p.document);
    const parent = normalizeDoc(parentDoc);
    if (docs.has(parent)) {
      adjacency.get(childDoc).add(parent);
      adjacency.get(parent).add(childDoc);
    }
  }));
  let components = 0;
  const visited = new Set();
  docs.forEach((doc) => {
    if (visited.has(doc)) return;
    components++;
    const queue = [doc];
    visited.add(doc);
    while (queue.length) {
      adjacency.get(queue.shift()).forEach((next) => {
        if (!visited.has(next)) { visited.add(next); queue.push(next); }
      });
    }
  });
  els.familyCount.textContent = components;
}

function setStatus(message, type = "") {
  els.formStatus.textContent = message;
  els.formStatus.className = `form-status full ${type}`;
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => els.toast.classList.remove("show"), 3200);
}

function readFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function initials(name = "") { return name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase(); }
function shortName(name = "") { const parts = name.split(/\s+/); return parts.length > 1 ? `${parts[0]} ${parts.at(-1)}` : name; }
function maskDocument(doc = "") { const clean = normalizeDoc(doc); return clean.length > 4 ? `${"*".repeat(Math.max(0, clean.length - 4))}${clean.slice(-4)}` : clean; }
function capitalize(value) { return value.charAt(0).toUpperCase() + value.slice(1); }
function slugify(value) { return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, ""); }
function escapeHtml(value = "") { const div = document.createElement("div"); div.textContent = value; return div.innerHTML; }
function escapeAttribute(value = "") { return String(value).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
