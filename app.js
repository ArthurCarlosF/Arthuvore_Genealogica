import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
import {
  getAuth, onAuthStateChanged, createUserWithEmailAndPassword,
  signInWithEmailAndPassword, signOut, updateProfile
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";
import {
  getFirestore, doc, setDoc, getDoc, getDocs, updateDoc, collection,
  query, where, serverTimestamp, onSnapshot
} from "https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js";

const LOCAL_KEY = "arthuvore-local-v2";
const SESSION_KEY = "arthuvore-session-v2";
const firebaseConfig = window.ARTHUVORE_FIREBASE_CONFIG || {};
const firebaseEnabled = Boolean(firebaseConfig.apiKey && !firebaseConfig.apiKey.includes("COLE_"));

const seed = {
  users: [
    { id: "demo-arthur", fullName: "Arthur Carlos Faria", birthYear: 1995, sex: "male", email: "arthur@demo.com", password: "demo1234", photoUrl: "", fatherId: "demo-carlos", motherId: "demo-marcia" },
    { id: "demo-carlos", fullName: "Carlos Faria", birthYear: 1965, sex: "male", email: "carlos@demo.com", password: "demo1234", photoUrl: "", fatherId: "", motherId: "" },
    { id: "demo-marcia", fullName: "Márcia Oliveira", birthYear: 1968, sex: "female", email: "marcia@demo.com", password: "demo1234", photoUrl: "", fatherId: "", motherId: "" },
    { id: "demo-lucas", fullName: "Lucas Faria", birthYear: 2020, sex: "male", email: "lucas@demo.com", password: "demo1234", photoUrl: "", fatherId: "demo-arthur", motherId: "" },
    { id: "demo-helena", fullName: "Helena Oliveira", birthYear: 1942, sex: "female", email: "helena@demo.com", password: "demo1234", photoUrl: "", fatherId: "", motherId: "" }
  ],
  requests: []
};

let auth;
let db;
let currentUser = null;
let allUsers = [];
let allRequests = [];
let selectedRelation = "father";
let requestTab = "received";
let pendingTarget = null;
let photoData = "";
let unsubscribeUsers = null;
let unsubscribeRequests = null;

const $ = (s) => document.querySelector(s);
const els = {
  publicView: $("#public-view"), dashboard: $("#dashboard"), publicNav: $("#public-nav"), privateNav: $("#private-nav"),
  authDialog: $("#auth-dialog"), authForm: $("#auth-form"), authStatus: $("#auth-status"),
  results: $("#connection-results"), requests: $("#requests-list"), treeSvg: $("#tree-svg"), treeEmpty: $("#tree-empty"),
  toast: $("#toast")
};

init();

async function init() {
  bindEvents();
  if (firebaseEnabled) {
    const app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);
    onAuthStateChanged(auth, async (user) => {
      if (!user) return showPublic();
      const snapshot = await getDoc(doc(db, "users", user.uid));
      if (!snapshot.exists()) return;
      currentUser = { id: user.uid, ...snapshot.data() };
      subscribeFirebase();
      showDashboard();
    });
  } else {
    ensureLocalData();
    const sessionId = localStorage.getItem(SESSION_KEY);
    currentUser = localData().users.find((u) => u.id === sessionId) || null;
    refreshLocal();
    currentUser ? showDashboard() : showPublic();
  }
}

function bindEvents() {
  document.querySelectorAll("[data-open-auth]").forEach((button) => button.addEventListener("click", () => openAuth(button.dataset.openAuth)));
  document.querySelectorAll("[data-close-dialog]").forEach((button) => button.addEventListener("click", () => button.closest("dialog").close()));
  $("#auth-switch").addEventListener("click", () => openAuth($("#auth-form").dataset.mode === "login" ? "register" : "login"));
  els.authForm.addEventListener("submit", submitAuth);
  $("#logout-button").addEventListener("click", logout);
  $("#open-requests").addEventListener("click", () => openPanel("requests-panel"));
  document.querySelectorAll("[data-panel]").forEach((button) => button.addEventListener("click", () => openPanel(button.dataset.panel)));
  document.querySelectorAll(".quick-relation").forEach((button) => button.addEventListener("click", () => openConnections(button.dataset.relation)));
  document.querySelectorAll(".relation-option").forEach((button) => button.addEventListener("click", () => chooseRelation(button.dataset.relation)));
  $("#connection-search").addEventListener("click", searchConnections);
  document.querySelectorAll("[data-request-tab]").forEach((button) => button.addEventListener("click", () => {
    requestTab = button.dataset.requestTab;
    document.querySelectorAll("[data-request-tab]").forEach((item) => item.classList.toggle("active", item === button));
    renderRequests();
  }));
  $("#confirm-send").addEventListener("click", sendPendingRequest);
  $("#degree-select").addEventListener("change", renderTree);
  $("#export-svg").addEventListener("click", exportTree);
  $("#profile-form").addEventListener("submit", saveProfile);
  $("#profile-photo").addEventListener("change", handlePhoto);
}

function openAuth(mode) {
  els.authForm.dataset.mode = mode;
  const register = mode === "register";
  $("#auth-register-fields").classList.toggle("hidden", !register);
  $("#auth-name").required = register;
  $("#auth-year").required = register;
  $("#auth-sex").required = register;
  $("#auth-password").autocomplete = register ? "new-password" : "current-password";
  $("#auth-eyebrow").textContent = register ? "Comece por você" : "Bem-vindo de volta";
  $("#auth-title").textContent = register ? "Criar nova conta" : "Entrar na conta";
  $("#auth-submit").textContent = register ? "Criar minha conta" : "Entrar";
  $("#auth-switch").textContent = register ? "Já tenho uma conta" : "Ainda não tenho conta";
  els.authStatus.textContent = "";
  if (!els.authDialog.open) els.authDialog.showModal();
}

async function submitAuth(event) {
  event.preventDefault();
  const mode = els.authForm.dataset.mode;
  const email = $("#auth-email").value.trim().toLowerCase();
  const password = $("#auth-password").value;
  setStatus(els.authStatus, mode === "register" ? "Criando conta..." : "Entrando...");
  try {
    if (firebaseEnabled) {
      if (mode === "register") {
        const credential = await createUserWithEmailAndPassword(auth, email, password);
        const profile = {
          fullName: $("#auth-name").value.trim(), birthYear: Number($("#auth-year").value),
          sex: $("#auth-sex").value, email, photoUrl: "", fatherId: "", motherId: "", createdAt: serverTimestamp()
        };
        await updateProfile(credential.user, { displayName: profile.fullName });
        await setDoc(doc(db, "users", credential.user.uid), profile);
      } else await signInWithEmailAndPassword(auth, email, password);
    } else {
      const data = localData();
      if (mode === "register") {
        if (data.users.some((u) => u.email === email)) throw new Error("Este e-mail já está cadastrado.");
        const profile = {
          id: crypto.randomUUID(), fullName: $("#auth-name").value.trim(), birthYear: Number($("#auth-year").value),
          sex: $("#auth-sex").value, email, password, photoUrl: "", fatherId: "", motherId: ""
        };
        data.users.push(profile);
        saveLocal(data);
        currentUser = profile;
      } else {
        currentUser = data.users.find((u) => u.email === email && u.password === password);
        if (!currentUser) throw new Error("E-mail ou senha incorretos.");
      }
      localStorage.setItem(SESSION_KEY, currentUser.id);
      refreshLocal();
      showDashboard();
    }
    els.authDialog.close();
    els.authForm.reset();
  } catch (error) {
    setStatus(els.authStatus, translateError(error), "error");
  }
}

async function logout() {
  if (firebaseEnabled) await signOut(auth);
  else {
    localStorage.removeItem(SESSION_KEY);
    currentUser = null;
    showPublic();
  }
}

function showPublic() {
  if (unsubscribeUsers) unsubscribeUsers();
  if (unsubscribeRequests) unsubscribeRequests();
  currentUser = null;
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
}

function subscribeFirebase() {
  unsubscribeUsers?.();
  unsubscribeRequests?.();
  unsubscribeUsers = onSnapshot(collection(db, "users"), (snapshot) => {
    allUsers = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
    currentUser = allUsers.find((u) => u.id === currentUser.id) || currentUser;
    renderAll();
  });
  unsubscribeRequests = onSnapshot(query(collection(db, "relationshipRequests"), where("participants", "array-contains", currentUser.id)), (snapshot) => {
    allRequests = snapshot.docs.map((item) => ({ id: item.id, ...item.data() }));
    renderAll();
  });
}

function refreshLocal() {
  const data = localData();
  allUsers = data.users;
  allRequests = data.requests;
  if (currentUser) currentUser = allUsers.find((u) => u.id === currentUser.id) || currentUser;
}

function renderAll() {
  if (!currentUser) return;
  $("#sidebar-name").textContent = currentUser.fullName;
  $("#sidebar-meta").textContent = `${currentUser.birthYear} · ${currentUser.sex === "male" ? "Masculino" : "Feminino"}`;
  $("#sidebar-avatar").innerHTML = currentUser.photoUrl ? `<img src="${safeAttr(currentUser.photoUrl)}" alt="">` : initials(currentUser.fullName);
  $("#father-status").textContent = relationName(currentUser.fatherId) || "Nenhum vínculo";
  $("#mother-status").textContent = relationName(currentUser.motherId) || "Nenhum vínculo";
  const pending = allRequests.filter((r) => r.toId === currentUser.id && r.status === "pending").length;
  $("#request-badge").textContent = pending;
  $("#sidebar-badge").textContent = pending;
  $("#request-badge").classList.toggle("hidden", !pending);
  $("#sidebar-badge").classList.toggle("hidden", !pending);
  fillProfile();
  renderTree();
  renderRequests();
}

function openPanel(id) {
  document.querySelectorAll(".dashboard-panel").forEach((panel) => panel.classList.toggle("hidden", panel.id !== id));
  document.querySelectorAll("[data-panel]").forEach((button) => button.classList.toggle("active", button.dataset.panel === id));
}

function openConnections(relation) {
  chooseRelation(relation);
  openPanel("connections-panel");
}

function chooseRelation(relation) {
  selectedRelation = relation;
  document.querySelectorAll(".relation-option").forEach((button) => button.classList.toggle("selected", button.dataset.relation === relation));
  els.results.replaceChildren();
  $("#connection-hint").textContent = "Informe ao menos um dos filtros para começar.";
}

function searchConnections() {
  const name = $("#connection-name").value.trim().toLocaleLowerCase("pt-BR");
  const year = Number($("#connection-year").value) || null;
  if (!name && !year) return $("#connection-hint").textContent = "Informe nome, ano de nascimento ou ambos.";
  const matches = allUsers.filter((user) =>
    user.id !== currentUser.id &&
    (selectedRelation !== "father" || user.sex === "male") &&
    (selectedRelation !== "mother" || user.sex === "female") &&
    (!name || user.fullName.toLocaleLowerCase("pt-BR").includes(name)) &&
    (!year || Number(user.birthYear) === year)
  );
  $("#connection-hint").textContent = `${matches.length} ${matches.length === 1 ? "pessoa encontrada" : "pessoas encontradas"}.`;
  els.results.replaceChildren();
  if (!matches.length) return els.results.innerHTML = '<div class="empty-card">Nenhuma pessoa encontrada. Tente outro nome ou ano.</div>';
  matches.forEach((user) => els.results.append(connectionCard(user)));
}

function connectionCard(user) {
  const article = document.createElement("article");
  article.className = "connection-card";
  article.innerHTML = `
    <div class="result-person">
      <div class="mini-avatar">${user.photoUrl ? `<img src="${safeAttr(user.photoUrl)}" alt="">` : initials(user.fullName)}</div>
      <div><strong>${escapeHtml(user.fullName)}</strong><span>Nascimento: ${user.birthYear}</span></div>
    </div>
    <button class="button button-secondary button-small">Enviar solicitação</button>`;
  article.querySelector("button").addEventListener("click", () => confirmRequest(user));
  return article;
}

function confirmRequest(user) {
  const slotError = relationSlotError(user);
  if (slotError) return showToast(slotError);
  const proposedParentId = selectedRelation === "child" ? currentUser.id : user.id;
  const proposedChildId = selectedRelation === "child" ? user.id : currentUser.id;
  if (hasAncestor(proposedParentId, proposedChildId)) {
    return showToast("Essa relação criaria um ciclo na árvore e não pode ser solicitada.");
  }
  pendingTarget = user;
  const relation = relationLabel(selectedRelation);
  $("#confirm-title").textContent = `Adicionar ${relation}?`;
  $("#confirm-text").textContent = `${user.fullName}, nascido(a) em ${user.birthYear}, receberá uma solicitação para confirmar que é ${relation} de você.`;
  $("#confirm-dialog").showModal();
}

function relationSlotError(target) {
  if (selectedRelation === "father" && currentUser.fatherId) return "Seu perfil já possui um pai vinculado.";
  if (selectedRelation === "mother" && currentUser.motherId) return "Seu perfil já possui uma mãe vinculada.";
  if (selectedRelation === "child" && currentUser.sex === "male" && target.fatherId) return "Essa pessoa já possui um pai vinculado.";
  if (selectedRelation === "child" && currentUser.sex === "female" && target.motherId) return "Essa pessoa já possui uma mãe vinculada.";
  return "";
}

function hasAncestor(personId, possibleAncestorId, visited = new Set()) {
  if (!personId || visited.has(personId)) return false;
  visited.add(personId);
  const person = allUsers.find((user) => user.id === personId);
  if (!person) return false;
  if (person.fatherId === possibleAncestorId || person.motherId === possibleAncestorId) return true;
  return hasAncestor(person.fatherId, possibleAncestorId, visited) ||
    hasAncestor(person.motherId, possibleAncestorId, visited);
}

async function sendPendingRequest(event) {
  event.preventDefault();
  if (!pendingTarget) return;
  if (hasPendingRequest(pendingTarget.id, selectedRelation)) return showToast("Já existe uma solicitação pendente para essa pessoa.");
  const request = {
    fromId: currentUser.id, toId: pendingTarget.id, relation: selectedRelation,
    participants: [currentUser.id, pendingTarget.id], status: "pending"
  };
  if (firebaseEnabled) {
    const requestId = `${currentUser.id}_${pendingTarget.id}_${selectedRelation}`;
    await setDoc(doc(db, "relationshipRequests", requestId), { ...request, createdAt: serverTimestamp() });
  }
  else {
    const data = localData();
    data.requests.push({ ...request, id: crypto.randomUUID(), createdAt: new Date().toISOString() });
    saveLocal(data);
    refreshLocal();
    renderAll();
  }
  $("#confirm-dialog").close();
  showToast("Solicitação enviada.");
}

function hasPendingRequest(toId, relation) {
  return allRequests.some((r) => r.fromId === currentUser.id && r.toId === toId && r.relation === relation && r.status === "pending");
}

function renderRequests() {
  if (!currentUser) return;
  const items = allRequests.filter((request) =>
    requestTab === "received" ? request.toId === currentUser.id : request.fromId === currentUser.id
  ).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  els.requests.replaceChildren();
  if (!items.length) return els.requests.innerHTML = `<div class="empty-card">Nenhuma solicitação ${requestTab === "received" ? "recebida" : "enviada"}.</div>`;
  items.forEach((request) => els.requests.append(requestCard(request)));
}

function requestCard(request) {
  const received = request.toId === currentUser.id;
  const other = allUsers.find((u) => u.id === (received ? request.fromId : request.toId));
  const article = document.createElement("article");
  article.className = "request-card";
  const description = received ? receivedRequestText(request, other) : `Você convidou ${other?.fullName || "esta pessoa"} como ${relationLabel(request.relation)}.`;
  article.innerHTML = `
    <div class="result-person">
      <div class="mini-avatar">${initials(other?.fullName || "?")}</div>
      <div><strong>${escapeHtml(other?.fullName || "Usuário")}</strong><span>${escapeHtml(description)}</span></div>
    </div>
    <div class="request-actions">
      <span class="request-status status-${request.status}">${statusLabel(request.status)}</span>
      ${received && request.status === "pending" ? '<button class="button button-secondary button-small reject">Recusar</button><button class="button button-primary button-small accept">Aceitar</button>' : ""}
    </div>`;
  article.querySelector(".accept")?.addEventListener("click", () => resolveRequest(request, true));
  article.querySelector(".reject")?.addEventListener("click", () => resolveRequest(request, false));
  return article;
}

function receivedRequestText(request, other) {
  if (request.relation === "father") return `${other?.fullName} quer adicionar você como pai.`;
  if (request.relation === "mother") return `${other?.fullName} quer adicionar você como mãe.`;
  return `${other?.fullName} quer adicionar você como filho(a).`;
}

async function resolveRequest(request, accept) {
  if (accept) {
    const updates = relationshipUpdates(request);
    if (!updates) return showToast("Não foi possível criar esse vínculo.");
    if (firebaseEnabled) {
      await updateDoc(doc(db, "users", updates.userId), updates.fields);
      await updateDoc(doc(db, "relationshipRequests", request.id), { status: "accepted", resolvedAt: serverTimestamp() });
    } else {
      const data = localData();
      Object.assign(data.users.find((u) => u.id === updates.userId), updates.fields);
      Object.assign(data.requests.find((r) => r.id === request.id), { status: "accepted", resolvedAt: new Date().toISOString() });
      saveLocal(data);
      refreshLocal();
    }
  } else if (firebaseEnabled) {
    await updateDoc(doc(db, "relationshipRequests", request.id), { status: "rejected", resolvedAt: serverTimestamp() });
  } else {
    const data = localData();
    Object.assign(data.requests.find((r) => r.id === request.id), { status: "rejected", resolvedAt: new Date().toISOString() });
    saveLocal(data);
    refreshLocal();
  }
  renderAll();
  showToast(accept ? "Vínculo confirmado." : "Solicitação recusada.");
}

function relationshipUpdates(request) {
  const requester = allUsers.find((u) => u.id === request.fromId);
  const target = allUsers.find((u) => u.id === request.toId);
  if (!requester || !target) return null;
  if (request.relation === "father") {
    if (target.sex !== "male") return null;
    if (requester.fatherId && requester.fatherId !== target.id) return null;
    if (hasAncestor(target.id, requester.id)) return null;
    return { userId: requester.id, fields: { fatherId: target.id } };
  }
  if (request.relation === "mother") {
    if (target.sex !== "female") return null;
    if (requester.motherId && requester.motherId !== target.id) return null;
    if (hasAncestor(target.id, requester.id)) return null;
    return { userId: requester.id, fields: { motherId: target.id } };
  }
  const occupied = requester.sex === "male" ? target.fatherId : target.motherId;
  if (occupied && occupied !== requester.id) return null;
  if (hasAncestor(requester.id, target.id)) return null;
  return {
    userId: target.id,
    fields: requester.sex === "male" ? { fatherId: requester.id } : { motherId: requester.id }
  };
}

function buildGraph(maxDegree) {
  const nodes = new Map([[currentUser.id, { ...currentUser, degree: 0 }]]);
  const edges = [];
  const queue = [{ user: currentUser, degree: 0 }];
  const visited = new Set([currentUser.id]);
  while (queue.length) {
    const { user, degree } = queue.shift();
    if (degree >= maxDegree) continue;
    const relatives = [];
    if (user.fatherId) relatives.push({ id: user.fatherId, type: "pai" });
    if (user.motherId) relatives.push({ id: user.motherId, type: "mãe" });
    allUsers.filter((child) => child.fatherId === user.id || child.motherId === user.id).forEach((child) => relatives.push({ id: child.id, type: "filho" }));
    relatives.forEach((relation) => {
      const person = allUsers.find((candidate) => candidate.id === relation.id);
      if (!person) return;
      edges.push({ from: user.id, to: person.id, type: relation.type });
      if (!visited.has(person.id)) {
        visited.add(person.id);
        nodes.set(person.id, { ...person, degree: degree + 1 });
        queue.push({ user: person, degree: degree + 1 });
      }
    });
  }
  return { nodes: [...nodes.values()], edges: uniqueEdges(edges) };
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
    const p = positions.get(node.id);
    return `<g class="tree-node${node.id === currentUser.id ? " focus" : ""}" transform="translate(${p.x},${p.y})">
      <circle r="54"/><text class="node-name" y="-4">${escapeHtml(shortName(node.fullName))}</text>
      <text class="node-meta" y="17">${node.birthYear}</text><title>${escapeHtml(node.fullName)}</title></g>`;
  }).join("");
  els.treeSvg.innerHTML = edges + nodes;
}

function fillProfile() {
  $("#profile-name").value = currentUser.fullName;
  $("#profile-year").value = currentUser.birthYear;
  $("#profile-sex").value = currentUser.sex;
  $("#profile-email").value = currentUser.email;
  $("#profile-photo-preview").innerHTML = currentUser.photoUrl ? `<img src="${safeAttr(currentUser.photoUrl)}" alt="">` : `<span>${initials(currentUser.fullName)}</span>`;
}

async function saveProfile(event) {
  event.preventDefault();
  const fields = {
    fullName: $("#profile-name").value.trim(), birthYear: Number($("#profile-year").value),
    sex: $("#profile-sex").value, ...(photoData ? { photoUrl: photoData } : {})
  };
  if (firebaseEnabled) await updateDoc(doc(db, "users", currentUser.id), fields);
  else {
    const data = localData();
    Object.assign(data.users.find((u) => u.id === currentUser.id), fields);
    saveLocal(data);
    refreshLocal();
    renderAll();
  }
  photoData = "";
  setStatus($("#profile-status"), "Perfil atualizado.", "success");
}

async function handlePhoto(event) {
  const file = event.target.files[0];
  if (!file) return;
  if (file.size > 400 * 1024) return showToast("A foto deve ter no máximo 400 KB.");
  photoData = await readFile(file);
  $("#profile-photo-preview").innerHTML = `<img src="${photoData}" alt="Prévia">`;
}

function exportTree() {
  if (!els.treeSvg.innerHTML) return showToast("Não há árvore para exportar.");
  const clone = els.treeSvg.cloneNode(true);
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  const style = document.createElementNS("http://www.w3.org/2000/svg", "style");
  style.textContent = `.tree-edge{fill:none;stroke:#9cb7ac;stroke-width:1.5}.tree-node circle{fill:#fff;stroke:#175244;stroke-width:3}.tree-node.focus circle{fill:#175244}.tree-node text{font-family:Arial;text-anchor:middle;fill:#173f35}.tree-node.focus text{fill:white}.node-name{font-size:12px;font-weight:bold}.node-meta{font-size:10px}`;
  clone.prepend(style);
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)], { type: "image/svg+xml" }));
  const link = document.createElement("a");
  link.href = url; link.download = `arthuvore-${slugify(currentUser.fullName)}.svg`; link.click();
  URL.revokeObjectURL(url);
}

function ensureLocalData() { if (!localStorage.getItem(LOCAL_KEY)) saveLocal(structuredClone(seed)); }
function localData() { return JSON.parse(localStorage.getItem(LOCAL_KEY)); }
function saveLocal(data) { localStorage.setItem(LOCAL_KEY, JSON.stringify(data)); }
function relationName(id) { return allUsers.find((u) => u.id === id)?.fullName || ""; }
function relationLabel(type) { return ({ father: "seu pai", mother: "sua mãe", child: "seu filho ou filha" })[type]; }
function statusLabel(status) { return ({ pending: "Pendente", accepted: "Aceita", rejected: "Recusada" })[status]; }
function uniqueEdges(edges) { const seen = new Set(); return edges.filter((e) => { const key = [e.from, e.to].sort().join("|"); if (seen.has(key)) return false; seen.add(key); return true; }); }
function initials(name = "") { return name.split(/\s+/).slice(0, 2).map((p) => p[0]).join("").toUpperCase(); }
function shortName(name = "") { const p = name.split(/\s+/); return p.length > 1 ? `${p[0]} ${p.at(-1)}` : name; }
function slugify(v) { return v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-"); }
function escapeHtml(value = "") { const div = document.createElement("div"); div.textContent = value; return div.innerHTML; }
function safeAttr(value = "") { return String(value).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;"); }
function setStatus(element, message, type = "") { element.textContent = message; element.className = `form-status ${type}`; }
function showToast(message) { els.toast.textContent = message; els.toast.classList.add("show"); clearTimeout(showToast.timer); showToast.timer = setTimeout(() => els.toast.classList.remove("show"), 3000); }
function translateError(error) {
  const code = error.code || "";
  if (code.includes("email-already-in-use")) return "Este e-mail já está cadastrado.";
  if (code.includes("invalid-credential")) return "E-mail ou senha incorretos.";
  if (code.includes("weak-password")) return "A senha precisa ter pelo menos oito caracteres.";
  return error.message || "Não foi possível concluir.";
}
function readFile(file) { return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file); }); }
