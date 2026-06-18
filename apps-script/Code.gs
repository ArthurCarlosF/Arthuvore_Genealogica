const USERS_SHEET = 'Usuarios';
const REQUESTS_SHEET = 'Solicitacoes';
const SESSIONS_SHEET = 'Sessoes';
const PHOTO_FOLDER_NAME = 'Arthuvore - Fotos';

const USER_HEADERS = [
  'id', 'fullName', 'birthYear', 'sex', 'email', 'photoUrl',
  'fatherId', 'motherId', 'passwordSalt', 'passwordHash', 'createdAt', 'updatedAt'
];
const REQUEST_HEADERS = [
  'id', 'fromId', 'toId', 'relation', 'status', 'createdAt', 'resolvedAt'
];
const SESSION_HEADERS = ['tokenHash', 'userId', 'expiresAt', 'createdAt'];

function doGet() {
  return jsonResponse({
    ok: true,
    data: { service: 'Arthuvore API', version: 2 }
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
    else if (action === 'createRequest') data = createRequest(requireUser(token), payload);
    else if (action === 'resolveRequest') data = resolveRequest(requireUser(token), payload);
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
    if (users.some(user => user.email === email)) {
      throw new Error('Este e-mail já está cadastrado.');
    }

    const salt = Utilities.getUuid();
    const now = new Date().toISOString();
    const user = {
      id: Utilities.getUuid(),
      fullName: cleanText(payload.fullName, 120),
      birthYear: Number(payload.birthYear),
      sex: normalizeSex(payload.sex),
      email: email,
      photoUrl: '',
      fatherId: '',
      motherId: '',
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
  const session = {
    tokenHash: hashSecret(token, 'SESSION'),
    userId: userId,
    expiresAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    createdAt: now.toISOString()
  };
  appendObject(SESSIONS_SHEET, SESSION_HEADERS, session);
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
  const requests = readTable(REQUESTS_SHEET, REQUEST_HEADERS)
    .filter(request => request.fromId === currentUser.id || request.toId === currentUser.id);
  return {
    currentUser: privateUser(currentUser),
    users: users.map(publicUser),
    requests: requests
  };
}

function updateProfile(currentUser, payload) {
  const fields = {
    fullName: cleanText(payload.fullName, 120),
    birthYear: Number(payload.birthYear),
    sex: normalizeSex(payload.sex),
    updatedAt: new Date().toISOString()
  };
  if (!fields.fullName) throw new Error('Informe o nome completo.');
  validateBirthYear(fields.birthYear);
  if (payload.photoUrl) fields.photoUrl = savePhoto(payload.photoUrl, currentUser.id);
  updateObject(USERS_SHEET, USER_HEADERS, currentUser.id, fields);
  return true;
}

function createRequest(currentUser, payload) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const users = readTable(USERS_SHEET, USER_HEADERS);
    const target = users.find(user => user.id === payload.toId);
    const relation = String(payload.relation || '');
    if (!target || target.id === currentUser.id) throw new Error('Pessoa inválida.');
    if (!['father', 'mother', 'child'].includes(relation)) throw new Error('Parentesco inválido.');
    if (relation === 'father' && target.sex !== 'male') throw new Error('O perfil selecionado não está cadastrado como masculino.');
    if (relation === 'mother' && target.sex !== 'female') throw new Error('O perfil selecionado não está cadastrado como feminino.');
    validateAvailableSlot(currentUser, target, relation);
    validateNoCycle(users, currentUser, target, relation);

    const requests = readTable(REQUESTS_SHEET, REQUEST_HEADERS);
    const duplicate = requests.some(request =>
      request.fromId === currentUser.id &&
      request.toId === target.id &&
      request.relation === relation &&
      request.status === 'pending'
    );
    if (duplicate) throw new Error('Já existe uma solicitação pendente.');

    const request = {
      id: Utilities.getUuid(),
      fromId: currentUser.id,
      toId: target.id,
      relation: relation,
      status: 'pending',
      createdAt: new Date().toISOString(),
      resolvedAt: ''
    };
    appendObject(REQUESTS_SHEET, REQUEST_HEADERS, request);
    return request;
  } finally {
    lock.releaseLock();
  }
}

function resolveRequest(currentUser, payload) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const requests = readTable(REQUESTS_SHEET, REQUEST_HEADERS);
    const request = requests.find(item => item.id === payload.requestId);
    if (!request || request.toId !== currentUser.id || request.status !== 'pending') {
      throw new Error('Solicitação não encontrada ou já respondida.');
    }

    if (!payload.accept) {
      updateObject(REQUESTS_SHEET, REQUEST_HEADERS, request.id, {
        status: 'rejected', resolvedAt: new Date().toISOString()
      });
      return true;
    }

    const users = readTable(USERS_SHEET, USER_HEADERS);
    const requester = users.find(user => user.id === request.fromId);
    const target = users.find(user => user.id === request.toId);
    if (!requester || !target) throw new Error('Um dos perfis não foi encontrado.');
    validateAvailableSlot(requester, target, request.relation);
    validateNoCycle(users, requester, target, request.relation);

    if (request.relation === 'father') {
      updateObject(USERS_SHEET, USER_HEADERS, requester.id, { fatherId: target.id, updatedAt: new Date().toISOString() });
    } else if (request.relation === 'mother') {
      updateObject(USERS_SHEET, USER_HEADERS, requester.id, { motherId: target.id, updatedAt: new Date().toISOString() });
    } else {
      const field = requester.sex === 'male' ? 'fatherId' : 'motherId';
      const updates = { updatedAt: new Date().toISOString() };
      updates[field] = requester.id;
      updateObject(USERS_SHEET, USER_HEADERS, target.id, updates);
    }

    updateObject(REQUESTS_SHEET, REQUEST_HEADERS, request.id, {
      status: 'accepted', resolvedAt: new Date().toISOString()
    });
    return true;
  } finally {
    lock.releaseLock();
  }
}

function validateAvailableSlot(requester, target, relation) {
  if (relation === 'father' && requester.fatherId && requester.fatherId !== target.id) {
    throw new Error('Este perfil já possui um pai vinculado.');
  }
  if (relation === 'mother' && requester.motherId && requester.motherId !== target.id) {
    throw new Error('Este perfil já possui uma mãe vinculada.');
  }
  if (relation === 'child') {
    const occupied = requester.sex === 'male' ? target.fatherId : target.motherId;
    if (occupied && occupied !== requester.id) throw new Error('A pessoa já possui esse vínculo parental.');
  }
}

function validateNoCycle(users, requester, target, relation) {
  const parentId = relation === 'child' ? requester.id : target.id;
  const childId = relation === 'child' ? target.id : requester.id;
  if (hasAncestor(users, parentId, childId, {})) {
    throw new Error('Essa relação criaria um ciclo na árvore.');
  }
}

function hasAncestor(users, personId, possibleAncestorId, visited) {
  if (!personId || visited[personId]) return false;
  visited[personId] = true;
  const person = users.find(user => user.id === personId);
  if (!person) return false;
  if (person.fatherId === possibleAncestorId || person.motherId === possibleAncestorId) return true;
  return hasAncestor(users, person.fatherId, possibleAncestorId, visited) ||
    hasAncestor(users, person.motherId, possibleAncestorId, visited);
}

function validateRegistration(payload) {
  if (!cleanText(payload.fullName, 120)) throw new Error('Informe o nome completo.');
  validateBirthYear(Number(payload.birthYear));
  normalizeSex(payload.sex);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail(payload.email))) throw new Error('E-mail inválido.');
  if (!payload.password || String(payload.password).length < 8) throw new Error('A senha deve ter pelo menos oito caracteres.');
}

function validateBirthYear(year) {
  if (year < 1800 || year > new Date().getFullYear()) throw new Error('Ano de nascimento inválido.');
}

function normalizeSex(value) {
  if (!['male', 'female'].includes(value)) throw new Error('Sexo inválido.');
  return value;
}

function publicUser(user) {
  return {
    id: user.id,
    fullName: user.fullName,
    birthYear: Number(user.birthYear),
    sex: user.sex,
    photoUrl: user.photoUrl || '',
    fatherId: user.fatherId || '',
    motherId: user.motherId || ''
  };
}

function privateUser(user) {
  return Object.assign(publicUser(user), { email: user.email });
}

function savePhoto(dataUrl, userId) {
  const match = String(dataUrl).match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);
  if (!match) throw new Error('Formato de foto inválido.');
  const bytes = Utilities.base64Decode(match[2]);
  if (bytes.length > 400 * 1024) throw new Error('A foto deve ter no máximo 400 KB.');
  const folders = DriveApp.getFoldersByName(PHOTO_FOLDER_NAME);
  const folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(PHOTO_FOLDER_NAME);
  const file = folder.createFile(Utilities.newBlob(bytes, match[1], `${userId}-${Date.now()}`));
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return `https://drive.google.com/thumbnail?id=${file.getId()}&sz=w400`;
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
  getTableSheet(name, headers).appendRow(headers.map(header => object[header] === undefined ? '' : object[header]));
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
  return String(value || '').trim().slice(0, maxLength);
}

function jsonResponse(value) {
  return ContentService.createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}
