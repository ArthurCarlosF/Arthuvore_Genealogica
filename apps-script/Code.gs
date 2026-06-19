const PEOPLE_SHEET = 'PessoasV4';
const HEADERS = [
  'id', 'fullName', 'normalizedName', 'birthDate',
  'fatherName', 'fatherNormalizedName', 'fatherBirthDate',
  'motherName', 'motherNormalizedName', 'motherBirthDate',
  'paternalGrandfatherName', 'paternalGrandfatherNormalizedName',
  'paternalGrandmotherName', 'paternalGrandmotherNormalizedName',
  'maternalGrandfatherName', 'maternalGrandfatherNormalizedName',
  'maternalGrandmotherName', 'maternalGrandmotherNormalizedName',
  'createdAt', 'updatedAt'
];

function doGet() {
  return jsonResponse({ ok: true, data: { service: 'Arthuvore API', version: 4 } });
}

function doPost(e) {
  try {
    const request = JSON.parse(e.postData.contents || '{}');
    const payload = request.payload || {};
    let data;
    if (request.action === 'list') data = listPeople();
    else if (request.action === 'create') data = createPerson(payload);
    else if (request.action === 'update') data = updatePerson(payload);
    else throw new Error('Operação desconhecida.');
    return jsonResponse({ ok: true, data: data });
  } catch (error) {
    return jsonResponse({ ok: false, error: error.message });
  }
}

function listPeople() {
  const people = readPeople();
  return { people: people.map(person => resolvedPerson(person, people)) };
}

function createPerson(payload) {
  validatePerson(payload);
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const now = new Date().toISOString();
    const person = buildPerson(payload, {
      id: Utilities.getUuid(), createdAt: now, updatedAt: now
    });
    appendObject(person);
    return { id: person.id };
  } finally {
    lock.releaseLock();
  }
}

function updatePerson(payload) {
  validatePerson(payload);
  if (!payload.id) throw new Error('Registro não encontrado.');
  const fields = buildPerson(payload, { updatedAt: new Date().toISOString() });
  delete fields.id;
  delete fields.createdAt;
  updateObject(payload.id, fields);
  return { id: payload.id };
}

function buildPerson(payload, base) {
  return Object.assign({}, base, {
    fullName: cleanName(payload.fullName),
    normalizedName: normalizeName(payload.fullName),
    birthDate: normalizeDate(payload.birthDate),
    fatherName: cleanName(payload.fatherName),
    fatherNormalizedName: normalizeName(payload.fatherName),
    fatherBirthDate: normalizeDate(payload.fatherBirthDate),
    motherName: cleanName(payload.motherName),
    motherNormalizedName: normalizeName(payload.motherName),
    motherBirthDate: normalizeDate(payload.motherBirthDate),
    paternalGrandfatherName: cleanOptionalName(payload.paternalGrandfatherName),
    paternalGrandfatherNormalizedName: normalizeName(payload.paternalGrandfatherName),
    paternalGrandmotherName: cleanOptionalName(payload.paternalGrandmotherName),
    paternalGrandmotherNormalizedName: normalizeName(payload.paternalGrandmotherName),
    maternalGrandfatherName: cleanOptionalName(payload.maternalGrandfatherName),
    maternalGrandfatherNormalizedName: normalizeName(payload.maternalGrandfatherName),
    maternalGrandmotherName: cleanOptionalName(payload.maternalGrandmotherName),
    maternalGrandmotherNormalizedName: normalizeName(payload.maternalGrandmotherName)
  });
}

function resolvedPerson(person, allPeople) {
  const safe = {};
  HEADERS.forEach(header => {
    if (!['normalizedName', 'fatherNormalizedName', 'motherNormalizedName',
      'paternalGrandfatherNormalizedName', 'paternalGrandmotherNormalizedName',
      'maternalGrandfatherNormalizedName', 'maternalGrandmotherNormalizedName'].includes(header)) {
      safe[header] = person[header] || '';
    }
  });
  safe.fatherMatch = resolveParent(person, allPeople, 'father');
  safe.motherMatch = resolveParent(person, allPeople, 'mother');
  return safe;
}

function resolveParent(child, allPeople, role) {
  const normalizedName = child[`${role}NormalizedName`];
  const criteria = parentCriteria(child, role);
  const fingerprint = parentFingerprint(normalizedName, criteria);
  if (!normalizedName) return { status: 'missing', fingerprint: fingerprint, candidateCount: 0 };

  const candidates = allPeople.filter(person =>
    person.id !== child.id && person.normalizedName === normalizedName
  );
  if (!candidates.length) return { status: 'missing', fingerprint: fingerprint, candidateCount: 0 };

  const scored = candidates.map(candidate => scoreCandidate(candidate, criteria))
    .filter(result => result.compatible);
  if (!scored.length) return { status: 'missing', fingerprint: fingerprint, candidateCount: 0 };

  const bestScore = Math.max.apply(null, scored.map(result => result.score));
  const best = scored.filter(result => result.score === bestScore);
  if (best.length === 1) {
    return { status: 'matched', fingerprint: fingerprint, candidateCount: 1, personId: best[0].person.id };
  }
  return { status: 'ambiguous', fingerprint: fingerprint, candidateCount: best.length };
}

function parentCriteria(child, role) {
  if (role === 'father') {
    return {
      birthDate: child.fatherBirthDate || '',
      fatherName: child.paternalGrandfatherNormalizedName || '',
      motherName: child.paternalGrandmotherNormalizedName || ''
    };
  }
  return {
    birthDate: child.motherBirthDate || '',
    fatherName: child.maternalGrandfatherNormalizedName || '',
    motherName: child.maternalGrandmotherNormalizedName || ''
  };
}

function scoreCandidate(person, criteria) {
  let score = 0;
  const checks = [
    { expected: criteria.birthDate, actual: person.birthDate, weight: 50 },
    { expected: criteria.fatherName, actual: person.fatherNormalizedName, weight: 20 },
    { expected: criteria.motherName, actual: person.motherNormalizedName, weight: 20 }
  ];
  for (let index = 0; index < checks.length; index++) {
    const check = checks[index];
    if (!check.expected) continue;
    if (!check.actual) continue;
    if (String(check.expected) !== String(check.actual)) {
      return { person: person, compatible: false, score: -1 };
    }
    score += check.weight;
  }
  return { person: person, compatible: true, score: score };
}

function parentFingerprint(normalizedName, criteria) {
  return [
    normalizedName || '',
    criteria.birthDate || '',
    criteria.fatherName || '',
    criteria.motherName || ''
  ].join('|');
}

function validatePerson(payload) {
  if (!cleanName(payload.fullName)) throw new Error('Informe o nome completo da pessoa.');
  if (!cleanName(payload.fatherName)) throw new Error('Informe o nome completo do pai.');
  if (!cleanName(payload.motherName)) throw new Error('Informe o nome completo da mãe.');
  ['birthDate', 'fatherBirthDate', 'motherBirthDate'].forEach(field => normalizeDate(payload[field]));
}

function normalizeDate(value) {
  if (!value) return '';
  const text = String(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new Error('Data de nascimento inválida.');
  const date = new Date(`${text}T12:00:00`);
  if (isNaN(date.getTime()) || date.getFullYear() < 1800 || date > new Date()) {
    throw new Error('Data de nascimento inválida.');
  }
  return text;
}

function getSheet() {
  const spreadsheetId = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (!spreadsheetId) throw new Error('Configure SPREADSHEET_ID nas propriedades do script.');
  const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
  let sheet = spreadsheet.getSheetByName(PEOPLE_SHEET);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(PEOPLE_SHEET);
    sheet.appendRow(HEADERS);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function readPeople() {
  const values = getSheet().getDataRange().getValues();
  if (values.length <= 1) return [];
  return values.slice(1).filter(row => row[0]).map(row =>
    HEADERS.reduce((object, header, index) => {
      object[header] = row[index];
      return object;
    }, {})
  );
}

function appendObject(object) {
  getSheet().appendRow(HEADERS.map(header => object[header] === undefined ? '' : object[header]));
}

function updateObject(id, fields) {
  const sheet = getSheet();
  const values = sheet.getDataRange().getValues();
  const rowIndex = values.findIndex((row, index) => index > 0 && String(row[0]) === String(id));
  if (rowIndex < 0) throw new Error('Registro não encontrado.');
  Object.keys(fields).forEach(key => {
    const column = HEADERS.indexOf(key);
    if (column >= 0) sheet.getRange(rowIndex + 1, column + 1).setValue(fields[key]);
  });
}

function normalizeName(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}
function cleanName(value) { return String(value || '').trim().replace(/\s+/g, ' ').slice(0, 120); }
function cleanOptionalName(value) { return value ? cleanName(value) : ''; }
function jsonResponse(value) { return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON); }
