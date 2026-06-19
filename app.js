const API_URL = "https://script.google.com/macros/s/AKfycbymXf-sR4HNeR2DegyGwEQ00LD3i-POnVsHnfcBl5eN4GkzgKzR4geDlpSB8PQx0tGh5A/exec";
let people = [];
let selectedId = "";

const $ = (selector) => document.querySelector(selector);
const els = {
  results: $("#people-results"), form: $("#person-form"), status: $("#form-status"),
  treeSection: $("#arvore"), treeSvg: $("#tree-svg"), treeEmpty: $("#tree-empty"), toast: $("#toast")
};

init();

async function init() {
  bindEvents();
  await loadPeople();
}

function bindEvents() {
  $("#search-button").addEventListener("click", searchPeople);
  $("#search-name").addEventListener("input", searchPeople);
  $("#toggle-details").addEventListener("click", () => togglePanel("details-panel", "toggle-details"));
  $("#toggle-grandparents").addEventListener("click", () => togglePanel("grandparents-panel", "toggle-grandparents"));
  $("#cancel-edit").addEventListener("click", resetForm);
  $("#edit-from-warning").addEventListener("click", () => editPerson(selectedId));
  $("#degree-select").addEventListener("change", renderTree);
  $("#export-svg").addEventListener("click", exportTree);
  els.form.addEventListener("submit", savePerson);
}

async function loadPeople() {
  try {
    const data = await api("list");
    people = data.people;
  } catch (error) {
    showToast(error.message);
  }
}

function searchPeople() {
  const term = normalizeName($("#search-name").value);
  els.results.replaceChildren();
  if (!term) {
    $("#search-status").textContent = "Digite um nome para consultar.";
    return;
  }
  const matches = people.filter((person) => normalizeName(person.fullName).includes(term));
  $("#search-status").textContent = `${matches.length} ${matches.length === 1 ? "registro encontrado" : "registros encontrados"}.`;
  if (!matches.length) {
    els.results.innerHTML = '<div class="empty-card">Nenhuma pessoa encontrada. Você pode cadastrá-la abaixo.</div>';
    return;
  }
  matches.forEach((person) => els.results.append(personCard(person)));
}

function personCard(person) {
  const article = document.createElement("article");
  article.className = "person-result-card";
  article.innerHTML = `
    <div><strong>${escapeHtml(person.fullName)}</strong>
      <span>${birthLabel(person.birthDate)} · Pai: ${escapeHtml(person.fatherName)} · Mãe: ${escapeHtml(person.motherName)}</span>
    </div>
    <div class="result-actions">
      <button class="button button-secondary button-small view">Ver árvore</button>
      <button class="button button-ghost button-small edit">Editar</button>
    </div>`;
  article.querySelector(".view").addEventListener("click", () => selectPerson(person.id));
  article.querySelector(".edit").addEventListener("click", () => editPerson(person.id));
  return article;
}

function togglePanel(panelId, buttonId, forceOpen = null) {
  const panel = $(`#${panelId}`);
  const button = $(`#${buttonId}`);
  const open = forceOpen === null ? panel.classList.contains("hidden") : forceOpen;
  panel.classList.toggle("hidden", !open);
  button.setAttribute("aria-expanded", String(open));
  button.querySelector(":scope > span").textContent = open ? "−" : "＋";
}

async function savePerson(event) {
  event.preventDefault();
  const payload = formPayload();
  try {
    setStatus("Salvando e recalculando conexões...");
    const id = $("#record-id").value;
    const result = await api(id ? "update" : "create", { ...payload, id });
    await loadPeople();
    resetForm();
    setStatus("Pessoa salva com sucesso.", "success");
    showToast("Registro salvo e árvore recalculada.");
    selectPerson(result.id);
  } catch (error) {
    setStatus(error.message, "error");
  }
}

function formPayload() {
  return {
    fullName: $("#person-name").value.trim(),
    fatherName: $("#father-name").value.trim(),
    motherName: $("#mother-name").value.trim(),
    birthDate: $("#person-birth-date").value,
    fatherBirthDate: $("#father-birth-date").value,
    motherBirthDate: $("#mother-birth-date").value,
    paternalGrandfatherName: $("#paternal-grandfather").value.trim(),
    paternalGrandmotherName: $("#paternal-grandmother").value.trim(),
    maternalGrandfatherName: $("#maternal-grandfather").value.trim(),
    maternalGrandmotherName: $("#maternal-grandmother").value.trim()
  };
}

function editPerson(id) {
  const person = people.find((item) => item.id === id);
  if (!person) return;
  const map = {
    "record-id": person.id, "person-name": person.fullName, "father-name": person.fatherName,
    "mother-name": person.motherName, "person-birth-date": person.birthDate,
    "father-birth-date": person.fatherBirthDate, "mother-birth-date": person.motherBirthDate,
    "paternal-grandfather": person.paternalGrandfatherName,
    "paternal-grandmother": person.paternalGrandmotherName,
    "maternal-grandfather": person.maternalGrandfatherName,
    "maternal-grandmother": person.maternalGrandmotherName
  };
  Object.entries(map).forEach(([id, value]) => { $(`#${id}`).value = value || ""; });
  $("#form-title").textContent = `Editar ${person.fullName}`;
  $("#cancel-edit").classList.remove("hidden");
  const hasDetails = person.birthDate || person.fatherBirthDate || person.motherBirthDate ||
    person.paternalGrandfatherName || person.paternalGrandmotherName ||
    person.maternalGrandfatherName || person.maternalGrandmotherName;
  togglePanel("details-panel", "toggle-details", Boolean(hasDetails));
  const hasGrandparents = person.paternalGrandfatherName || person.paternalGrandmotherName ||
    person.maternalGrandfatherName || person.maternalGrandmotherName;
  togglePanel("grandparents-panel", "toggle-grandparents", Boolean(hasGrandparents));
  $("#cadastrar").scrollIntoView({ behavior: "smooth" });
}

function resetForm() {
  els.form.reset();
  $("#record-id").value = "";
  $("#form-title").textContent = "Cadastrar uma pessoa";
  $("#cancel-edit").classList.add("hidden");
  togglePanel("details-panel", "toggle-details", false);
  togglePanel("grandparents-panel", "toggle-grandparents", false);
}

function selectPerson(id) {
  selectedId = id;
  const person = people.find((item) => item.id === id);
  if (!person) return;
  $("#tree-title").textContent = `Árvore de ${person.fullName}`;
  els.treeSection.classList.remove("hidden");
  renderTree();
  els.treeSection.scrollIntoView({ behavior: "smooth" });
}

function buildGraph(root, maxDegree) {
  const nodes = new Map([[root.id, { ...root, degree: 0, generation: 0, kind: "person" }]]);
  const edges = [];
  const queue = [{ node: nodes.get(root.id), degree: 0, generation: 0 }];
  const visited = new Set([root.id]);

  while (queue.length) {
    const { node, degree, generation } = queue.shift();
    if (degree >= maxDegree) continue;
    if (node.kind === "person") {
      ["father", "mother"].forEach((role) => {
        const match = node[`${role}Match`];
        if (!match) return;
        const parent = parentNode(node, role, match, degree + 1, generation - 1);
        addNode(parent, degree + 1, generation - 1);
        edges.push({ from: node.id, to: parent.id });
      });
      people.forEach((child) => {
        ["father", "mother"].forEach((role) => {
          const match = child[`${role}Match`];
          if (match?.status === "matched" && match.personId === node.id) {
            const childNode = { ...child, degree: degree + 1, generation: generation + 1, kind: "person" };
            addNode(childNode, degree + 1, generation + 1);
            edges.push({ from: child.id, to: node.id });
          }
        });
      });
    } else {
      people.forEach((child) => {
        ["father", "mother"].forEach((role) => {
          const match = child[`${role}Match`];
          if (match?.status === node.status && match.fingerprint === node.fingerprint) {
            const childNode = { ...child, degree: degree + 1, generation: generation + 1, kind: "person" };
            addNode(childNode, degree + 1, generation + 1);
            edges.push({ from: child.id, to: node.id });
          }
        });
      });
    }
  }
  return { nodes: [...nodes.values()], edges: uniqueEdges(edges) };

  function addNode(node, degree, generation) {
    if (!nodes.has(node.id)) nodes.set(node.id, node);
    if (!visited.has(node.id)) {
      visited.add(node.id);
      queue.push({ node, degree, generation });
    }
  }
}

function parentNode(child, role, match, degree, generation) {
  if (match.status === "matched") {
    const person = people.find((item) => item.id === match.personId);
    if (person) return { ...person, degree, generation, kind: "person" };
  }
  return {
    id: `${match.status}:${match.fingerprint}`,
    fullName: child[`${role}Name`],
    degree, generation, kind: "placeholder", status: match.status,
    fingerprint: match.fingerprint, candidateCount: match.candidateCount || 0
  };
}

function renderTree() {
  const root = people.find((item) => item.id === selectedId);
  if (!root) return;
  const graph = buildGraph(root, Number($("#degree-select").value));
  const ambiguous = graph.nodes.filter((node) => node.kind === "placeholder" && node.status === "ambiguous");
  $("#ambiguity-banner").classList.toggle("hidden", !ambiguous.length);
  $("#ambiguity-message").textContent = ambiguous.length
    ? `Encontramos mais de uma pessoa possível para ${ambiguous.map((node) => node.fullName).join(", ")}. Adicione datas ou nomes dos avós para melhorar a correspondência.`
    : "";
  els.treeEmpty.classList.toggle("hidden", graph.nodes.length > 1);
  drawGraph(graph, root.id);
}

function drawGraph(graph, rootId) {
  const levels = new Map();
  graph.nodes.forEach((node) => {
    if (!levels.has(node.generation)) levels.set(node.generation, []);
    levels.get(node.generation).push(node);
  });
  const widest = Math.max(...[...levels.values()].map((items) => items.length), 1);
  const width = Math.max(900, widest * 190 + 120);
  const height = Math.max(540, levels.size * 165 + 90);
  els.treeSvg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  els.treeSvg.setAttribute("width", width); els.treeSvg.setAttribute("height", height);
  const positions = new Map();
  [...levels.entries()].sort(([a], [b]) => a - b).forEach(([, items], levelIndex) => {
    const spacing = width / (items.length + 1);
    items.forEach((node, index) => positions.set(node.id, { x: spacing * (index + 1), y: 85 + levelIndex * 155 }));
  });
  const edgeMarkup = graph.edges.map((edge) => {
    const a = positions.get(edge.from), b = positions.get(edge.to);
    if (!a || !b) return "";
    const movingDown = b.y > a.y;
    const startY = a.y + (movingDown ? 48 : -48);
    const endY = b.y + (movingDown ? -48 : 48);
    const middleY = (startY + endY) / 2;
    return `<path class="tree-edge" d="M${a.x},${startY} C${a.x},${middleY} ${b.x},${middleY} ${b.x},${endY}"/>`;
  }).join("");
  const nodeMarkup = graph.nodes.map((node) => {
    const p = positions.get(node.id);
    if (node.kind === "placeholder") {
      const ambiguous = node.status === "ambiguous";
      return `<g class="tree-node placeholder${ambiguous ? " ambiguous" : ""}" transform="translate(${p.x},${p.y})">
        <rect x="-68" y="-45" width="136" height="90" rx="16"/><text class="question-mark" y="-13">?</text>
        <text class="node-name" y="8">${escapeHtml(shortName(node.fullName))}</text>
        <text class="node-meta" y="27">${ambiguous ? `${node.candidateCount} possibilidades` : "Ainda não cadastrado"}</text></g>`;
    }
    return `<g class="tree-node${node.id === rootId ? " focus" : ""}" transform="translate(${p.x},${p.y})">
      <circle r="54"/><text class="node-name" y="-4">${escapeHtml(shortName(node.fullName))}</text>
      <text class="node-meta" y="17">${birthLabel(node.birthDate)}</text></g>`;
  }).join("");
  els.treeSvg.innerHTML = edgeMarkup + nodeMarkup;
}

function exportTree() {
  if (!els.treeSvg.innerHTML) return showToast("Gere uma árvore antes de exportar.");
  const clone = els.treeSvg.cloneNode(true);
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  const style = document.createElementNS("http://www.w3.org/2000/svg", "style");
  style.textContent = `.tree-edge{fill:none;stroke:#9cb7ac;stroke-width:1.5}.tree-node circle{fill:#fff;stroke:#175244;stroke-width:3}.tree-node.focus circle{fill:#175244}.tree-node rect{fill:#f7f3e9;stroke:#ca9650;stroke-width:2;stroke-dasharray:5 4}.tree-node text{font-family:Arial;text-anchor:middle;fill:#173f35}.tree-node.focus text{fill:white}.node-name{font-size:12px;font-weight:bold}.node-meta{font-size:9px}.question-mark{font-size:17px;font-weight:bold}`;
  clone.prepend(style);
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)], { type: "image/svg+xml" }));
  const link = document.createElement("a"); link.href = url; link.download = "arthuvore.svg"; link.click(); URL.revokeObjectURL(url);
}

async function api(action, payload = {}) {
  const response = await fetch(API_URL, {
    method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ action, payload })
  });
  const result = await response.json();
  if (!result.ok) throw new Error(result.error || "Não foi possível acessar o servidor.");
  return result.data;
}

function birthLabel(date) {
  if (!date) return "Data não informada";
  const [year, month, day] = date.split("-");
  return `${day}/${month}/${year}`;
}
function normalizeName(value = "") { return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/[^A-Z0-9 ]/g, " ").replace(/\s+/g, " ").trim(); }
function shortName(name = "") { const parts = name.split(/\s+/); return parts.length > 1 ? `${parts[0]} ${parts.at(-1)}` : name; }
function uniqueEdges(edges) { const seen = new Set(); return edges.filter((edge) => { const key = [edge.from, edge.to].sort().join("|"); if (seen.has(key)) return false; seen.add(key); return true; }); }
function escapeHtml(value = "") { const div = document.createElement("div"); div.textContent = value; return div.innerHTML; }
function setStatus(message, type = "") { els.status.textContent = message; els.status.className = `form-status ${type}`; }
function showToast(message) { els.toast.textContent = message; els.toast.classList.add("show"); clearTimeout(showToast.timer); showToast.timer = setTimeout(() => els.toast.classList.remove("show"), 3000); }
