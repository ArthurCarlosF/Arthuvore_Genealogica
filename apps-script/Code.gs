const USERS_SHEET = 'UsuariosV3';
const SESSIONS_SHEET = 'SessoesV3';

const USER_HEADERS = [
  'id', 'fullName', 'normalizedName', 'email',
  'birthYear', 'birthMonth', 'birthDay', 'document',
  'fatherName', 'fatherNormalizedName', 'fatherBirthYear', 'fatherBirthMonth', 'fatherBirthDay', 'fatherDocument',
  'motherName', 'motherNormalizedName', 'motherBirthYear', 'motherBirthMonth', 'motherBirthDay', 'motherDocument',
  'passwordSalt', 'passwordHash', 'createdAt', 'updatedAt'
];
const SESSION_HEADERS = ['tokenHash', 'userId', 'expiresAt', 'createdAt'];

function doGet() {
  return jsonResponse({
    ok: true,
    data: { service: 'Arthuvore API', version: 3 }
  });
}

function doPost(e) {
  try {
    const request = JSON.parse(e.postData.contents || '{}');
    const action = request.action;
    const payload = request.payload || {};
    const token = request.token || '';
    let data;

    if (action === 'register') data = register(payload);
    else if (action === 'login') data = login(payload);
    else if (action === 'bootstrap') data = bootstrap(requireUser(token));
    else if (action === 'logout') data = logout(token);
    else if (action === 'updateProfile') data = updateProfile(requireUser(token), payload);
    else throw new Error('Operação desconhecida.');

    return jsonResponse({ ok: true, data: data });
  } catch (error) {
    return jsonResponse({ ok: false, error: error.message });
  }
}

function register(payload) {
  validateRegistration(payload);
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const users = readTable(USERS_SHEET, USER_HEADERS);
    const email = cleanEmail(payload.email);
    if (users.some(user => user.email === email)) throw new Error('Este e-mail já está cadastrado.');

    const salt = Utilities.getUuid();
    const now = new Date().toISOString();
    const user = {
      id: Utilities.getUuid(),
      fullName: cleanText(payload.fullName, 120),
      normalizedName: normalizeName(payload.fullName),
      email: email,
      birthYear: '', birthMonth: '', birthDay: '', document: '',
      fatherName: cleanText(payload.fatherName, 120),
      fatherNormalizedName: normalizeName(payload.fatherName),
      fatherBirthYear: '', fatherBirthMonth: '', fatherBirthDay: '', fatherDocument: '',
      motherName: cleanText(payload.motherName, 120),
      motherNormalizedName: normalizeName(payload.motherName),
      motherBirthYear: '', motherBirthMonth: '', motherBirthDay: '', motherDocument: '',
      passwordSalt: salt,
      passwordHash: hashSecret(payload.password, salt),
      createdAt: now,
      updatedAt: now
    };
    appendObject(USERS_SHEET, USER_HEADERS, user);
    return createSession(user.id);
  } finally {
    lock.releaseLock();
  }
}

function login(payload) {
  const email = cleanEmail(payload.email);
  const user = readTable(USERS_SHEET, USER_HEADERS).find(item => item.email === email);
  if (!user || !safeEquals(user.passwordHash, hashSecret(payload.password || '', user.passwordSalt))) {
    throw new Error('E-mail ou senha incorretos.');
  }
  return createSession(user.id);
}

function createSession(userId) {
  const token = `${Utilities.getUuid()}${Utilities.getUuid()}`.replace(/-/g, '');
  const now = new Date();
  appendObject(SESSIONS_SHEET, SESSION_HEADERS, {
    tokenHash: hashSecret(token, 'SESSION'),
    userId: userId,
    expiresAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    createdAt: now.toISOString()
  });
  return { token: token };
}

function requireUser(token) {
  if (!token) throw new Error('Sessão expirada. Entre novamente.');
  const tokenHash = hashSecret(token, 'SESSION');
  const session = readTable(SESSIONS_SHEET, SESSION_HEADERS)
    .find(item => safeEquals(item.tokenHash, tokenHash) && new Date(item.expiresAt) > new Date());
  if (!session) throw new Error('Sessão expirada. Entre novamente.');
  const user = readTable(USERS_SHEET, USER_HEADERS).find(item => item.id === session.userId);
  if (!user) throw new Error('Conta não encontrada.');
  return user;
}

function logout(token) {
  if (!token) return true;
  const sheet = getTableSheet(SESSIONS_SHEET, SESSION_HEADERS);
  const values = sheet.getDataRange().getValues();
  const tokenHash = hashSecret(token, 'SESSION');
  for (let row = values.length - 1; row >= 1; row--) {
    if (safeEquals(String(values[row][0]), tokenHash)) sheet.deleteRow(row + 1);
  }
  return true;
}

function bootstrap(currentUser) {
  const users = readTable(USERS_SHEET, USER_HEADERS);
  const resolvedUsers = users.map(user => resolvedPublicUser(user, users));
  const currentResolved = resolvedUsers.find(user => user.id === currentUser.id);
  return {
    currentUser: Object.assign({}, currentResolved, privateFields(currentUser)),
    users: resolvedUsers
  };
}

function updateProfile(currentUser, payload) {
  validateProfile(payload);
  const fields = {
    fullName: cleanText(payload.fullName, 120),
    normalizedName: normalizeName(payload.fullName),
    birthYear: optionalInteger(payload.birthYear),
    birthMonth: optionalInteger(payload.birthMonth),
    birthDay: optionalInteger(payload.birthDay),
    document: normalizeDocument(payload.document),
    fatherName: cleanText(payload.fatherName, 120),
    fatherNormalizedName: normalizeName(payload.fatherName),
    fatherBirthYear: optionalInteger(payload.fatherBirthYear),
    fatherBirthMonth: optionalInteger(payload.fatherBirthMonth),
    fatherBirthDay: optionalInteger(payload.fatherBirthDay),
    fatherDocument: normalizeDocument(payload.fatherDocument),
    motherName: cleanText(payload.motherName, 120),
    motherNormalizedName: normalizeName(payload.motherName),
    motherBirthYear: optionalInteger(payload.motherBirthYear),
    motherBirthMonth: optionalInteger(payload.motherBirthMonth),
    motherBirthDay: optionalInteger(payload.motherBirthDay),
    motherDocument: normalizeDocument(payload.motherDocument),
    updatedAt: new Date().toISOString()
  };
  updateObject(USERS_SHEET, USER_HEADERS, currentUser.id, fields);
  return true;
}

function resolvedPublicUser(user, allUsers) {
  const safe = {
    id: user.id,
    fullName: user.fullName,
    birthYear: numberOrEmpty(user.birthYear),
    birthMonth: numberOrEmpty(user.birthMonth),
    birthDay: numberOrEmpty(user.birthDay),
    fatherName: user.fatherName || '',
    motherName: user.motherName || ''
  };
  safe.fatherMatch = resolveParent(user, allUsers, 'father');
  safe.motherMatch = resolveParent(user, allUsers, 'mother');
  return safe;
}

function resolveParent(child, allUsers, role) {
  const normalizedName = child[`${role}NormalizedName`] || normalizeName(child[`${role}Name`]);
  if (!normalizedName) return { status: 'missing', normalizedName: '', candidateCount: 0 };

  const candidates = allUsers.filter(candidate =>
    candidate.id !== child.id && candidate.normalizedName === normalizedName
  );
  if (!candidates.length) {
    return { status: 'missing', normalizedName: normalizedName, candidateCount: 0 };
  }

  const criteria = {
    birthYear: numberOrEmpty(child[`${role}BirthYear`]),
    birthMonth: numberOrEmpty(child[`${role}BirthMonth`]),
    birthDay: numberOrEmpty(child[`${role}BirthDay`]),
    document: normalizeDocument(child[`${role}Document`])
  };
  const scored = candidates.map(candidate => scoreCandidate(candidate, criteria))
    .filter(result => result.compatible);

  if (!scored.length) {
    return { status: 'missing', normalizedName: normalizedName, candidateCount: 0 };
  }
  const bestScore = Math.max.apply(null, scored.map(result => result.score));
  const best = scored.filter(result => result.score === bestScore);
  if (best.length === 1) {
    return {
      status: 'matched',
      normalizedName: normalizedName,
      candidateCount: 1,
      userId: best[0].candidate.id
    };
  }
  return {
    status: 'ambiguous',
    normalizedName: normalizedName,
    candidateCount: best.length
  };
}

function scoreCandidate(candidate, criteria) {
  let score = 0;
  const comparisons = [
    ['birthYear', 20],
    ['birthMonth', 5],
    ['birthDay', 2],
    ['document', 100]
  ];
  for (let index = 0; index < comparisons.length; index++) {
    const field = comparisons[index][0];
    const weight = comparisons[index][1];
    const expected = criteria[field];
    if (expected === '' || expected === 0) continue;
    const actual = field === 'document'
      ? normalizeDocument(candidate.document)
      : numberOrEmpty(candidate[field]);
    if (actual === '' || actual === 0) continue;
    if (String(actual) !== String(expected)) return { candidate: candidate, compatible: false, score: -1 };
    score += weight;
  }
  return { candidate: candidate, compatible: true, score: score };
}

function privateFields(user) {
  return {
    email: user.email,
    document: user.document || '',
    fatherBirthYear: numberOrEmpty(user.fatherBirthYear),
    fatherBirthMonth: numberOrEmpty(user.fatherBirthMonth),
    fatherBirthDay: numberOrEmpty(user.fatherBirthDay),
    fatherDocument: user.fatherDocument || '',
    motherBirthYear: numberOrEmpty(user.motherBirthYear),
    motherBirthMonth: numberOrEmpty(user.motherBirthMonth),
    motherBirthDay: numberOrEmpty(user.motherBirthDay),
    motherDocument: user.motherDocument || ''
  };
}

function validateRegistration(payload) {
  if (!cleanText(payload.fullName, 120)) throw new Error('Informe seu nome completo.');
  if (!cleanText(payload.fatherName, 120)) throw new Error('Informe o nome completo do seu pai.');
  if (!cleanText(payload.motherName, 120)) throw new Error('Informe o nome completo da sua mãe.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail(payload.email))) throw new Error('E-mail inválido.');
  if (!payload.password || String(payload.password).length < 8) throw new Error('A senha deve ter pelo menos oito caracteres.');
}

function validateProfile(payload) {
  if (!cleanText(payload.fullName, 120)) throw new Error('Informe seu nome completo.');
  if (!cleanText(payload.fatherName, 120)) throw new Error('Informe o nome completo do seu pai.');
  if (!cleanText(payload.motherName, 120)) throw new Error('Informe o nome completo da sua mãe.');
  validateDateParts(payload.birthYear, payload.birthMonth, payload.birthDay, 'sua');
  validateDateParts(payload.fatherBirthYear, payload.fatherBirthMonth, payload.fatherBirthDay, 'do seu pai');
  validateDateParts(payload.motherBirthYear, payload.motherBirthMonth, payload.motherBirthDay, 'da sua mãe');
}

function validateDateParts(year, month, day, label) {
  year = optionalInteger(year);
  month = optionalInteger(month);
  day = optionalInteger(day);
  if (year && (year < 1800 || year > new Date().getFullYear())) throw new Error(`Ano de nascimento ${label} inválido.`);
  if (month && (month < 1 || month > 12)) throw new Error(`Mês de nascimento ${label} inválido.`);
  if (day && (day < 1 || day > 31)) throw new Error(`Dia de nascimento ${label} inválido.`);
  if ((month || day) && !year) throw new Error(`Informe o ano antes do mês ou dia de nascimento ${label}.`);
  if (day && !month) throw new Error(`Informe o mês antes do dia de nascimento ${label}.`);
}

function getTableSheet(name, headers) {
  const spreadsheetId = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (!spreadsheetId) throw new Error('Configure SPREADSHEET_ID nas propriedades do script.');
  const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
  let sheet = spreadsheet.getSheetByName(name);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(name);
    sheet.appendRow(headers);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function readTable(name, headers) {
  const values = getTableSheet(name, headers).getDataRange().getValues();
  if (values.length <= 1) return [];
  return values.slice(1).filter(row => row[0]).map(row =>
    headers.reduce((object, header, index) => {
      object[header] = row[index];
      return object;
    }, {})
  );
}

function appendObject(name, headers, object) {
  getTableSheet(name, headers).appendRow(headers.map(header =>
    object[header] === undefined ? '' : object[header]
  ));
}

function updateObject(name, headers, id, fields) {
  const sheet = getTableSheet(name, headers);
  const values = sheet.getDataRange().getValues();
  const idIndex = headers.indexOf('id');
  const rowIndex = values.findIndex((row, index) => index > 0 && String(row[idIndex]) === String(id));
  if (rowIndex < 0) throw new Error('Registro não encontrado.');
  Object.keys(fields).forEach(key => {
    const column = headers.indexOf(key);
    if (column >= 0) sheet.getRange(rowIndex + 1, column + 1).setValue(fields[key]);
  });
}

function hashSecret(value, salt) {
  const pepper = PropertiesService.getScriptProperties().getProperty('PASSWORD_PEPPER');
  if (!pepper) throw new Error('Configure PASSWORD_PEPPER nas propriedades do script.');
  const bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    `${salt}:${String(value)}:${pepper}`,
    Utilities.Charset.UTF_8
  );
  return Utilities.base64Encode(bytes);
}

function normalizeName(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeDocument(value) {
  return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function numberOrEmpty(value) {
  return value === '' || value === null || value === undefined ? '' : Number(value);
}

function optionalInteger(value) {
  if (value === '' || value === null || value === undefined) return '';
  const number = Number(value);
  return Number.isFinite(number) ? Math.trunc(number) : '';
}

function safeEquals(a, b) {
  a = String(a || '');
  b = String(b || '');
  if (!a || !b || a.length !== b.length) return false;
  let result = 0;
  for (let index = 0; index < a.length; index++) result |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return result === 0;
}

function cleanEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function cleanText(value, maxLength) {
  return String(value || '').trim().replace(/\s+/g, ' ').slice(0, maxLength);
}

function jsonResponse(value) {
  return ContentService.createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}
