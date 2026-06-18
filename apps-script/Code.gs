const SHEET_NAME = 'Pessoas';
const PHOTO_FOLDER_NAME = 'Raizes - Fotos';
const HEADERS = [
  'id', 'fullName', 'birthYear', 'document', 'fatherDocument', 'motherDocument',
  'email', 'photoUrl', 'passwordSalt', 'passwordHash', 'createdAt', 'updatedAt'
];

function doGet() {
  return jsonResponse({ ok: true, data: { service: 'Raizes API', version: 1 } });
}

function doPost(e) {
  try {
    const request = JSON.parse(e.postData.contents || '{}');
    const action = request.action;
    const payload = request.payload || {};
    let data;

    if (action === 'list') data = listPeople();
    else if (action === 'create') data = createPerson(payload);
    else if (action === 'verify') data = verifyPassword(payload.id, payload.password);
    else if (action === 'update') data = updatePerson(payload);
    else throw new Error('Operação desconhecida.');

    return jsonResponse({ ok: true, data: data });
  } catch (error) {
    return jsonResponse({ ok: false, error: error.message });
  }
}

function listPeople() {
  return readRows().map(publicPerson);
}

function createPerson(payload) {
  validatePerson(payload, true);
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const rows = readRows();
    const document = normalizeDocument(payload.document);
    if (rows.some(row => row.document === document)) throw new Error('Este documento já está cadastrado.');

    const salt = Utilities.getUuid();
    const now = new Date().toISOString();
    const person = {
      id: Utilities.getUuid(),
      fullName: cleanText(payload.fullName, 120),
      birthYear: Number(payload.birthYear),
      document: document,
      fatherDocument: normalizeDocument(payload.fatherDocument),
      motherDocument: normalizeDocument(payload.motherDocument),
      email: cleanText(payload.email, 120).toLowerCase(),
      photoUrl: savePhoto(payload.photoData, document),
      passwordSalt: salt,
      passwordHash: hashPassword(payload.password, salt),
      createdAt: now,
      updatedAt: now
    };
    getSheet().appendRow(HEADERS.map(header => person[header] || ''));
    return publicPerson(person);
  } finally {
    lock.releaseLock();
  }
}

function updatePerson(payload) {
  validatePerson(payload, false);
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const sheet = getSheet();
    const rows = readRows();
    const index = rows.findIndex(row => row.id === payload.id);
    if (index < 0) throw new Error('Cadastro não encontrado.');
    const current = rows[index];
    if (!safeEquals(current.passwordHash, hashPassword(payload.password, current.passwordSalt))) {
      throw new Error('Senha incorreta.');
    }

    const document = normalizeDocument(payload.document);
    if (rows.some((row, i) => i !== index && row.document === document)) {
      throw new Error('Este documento já está cadastrado.');
    }

    const newSalt = payload.newPassword ? Utilities.getUuid() : current.passwordSalt;
    const updated = {
      ...current,
      fullName: cleanText(payload.fullName, 120),
      birthYear: Number(payload.birthYear),
      document: document,
      fatherDocument: normalizeDocument(payload.fatherDocument),
      motherDocument: normalizeDocument(payload.motherDocument),
      email: cleanText(payload.email, 120).toLowerCase(),
      photoUrl: payload.photoData ? savePhoto(payload.photoData, document) : current.photoUrl,
      passwordSalt: newSalt,
      passwordHash: payload.newPassword ? hashPassword(payload.newPassword, newSalt) : current.passwordHash,
      updatedAt: new Date().toISOString()
    };
    sheet.getRange(index + 2, 1, 1, HEADERS.length).setValues([HEADERS.map(header => updated[header] || '')]);
    return publicPerson(updated);
  } finally {
    lock.releaseLock();
  }
}

function verifyPassword(id, password) {
  const person = readRows().find(row => row.id === id);
  if (!person || !password) return false;
  return safeEquals(person.passwordHash, hashPassword(password, person.passwordSalt));
}

function getSheet() {
  const spreadsheetId = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (!spreadsheetId) throw new Error('Configure SPREADSHEET_ID nas propriedades do script.');
  const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
  let sheet = spreadsheet.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(SHEET_NAME);
    sheet.appendRow(HEADERS);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function readRows() {
  const values = getSheet().getDataRange().getValues();
  if (values.length <= 1) return [];
  const headers = values[0];
  return values.slice(1).filter(row => row[0]).map(row =>
    headers.reduce((object, header, index) => {
      object[header] = row[index];
      return object;
    }, {})
  );
}

function savePhoto(dataUrl, document) {
  if (!dataUrl) return '';
  const match = dataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/);
  if (!match) throw new Error('Formato de foto inválido.');
  const bytes = Utilities.base64Decode(match[2]);
  if (bytes.length > 2 * 1024 * 1024) throw new Error('A foto deve ter no máximo 2 MB.');
  const extension = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[match[1]];
  const folders = DriveApp.getFoldersByName(PHOTO_FOLDER_NAME);
  const folder = folders.hasNext() ? folders.next() : DriveApp.createFolder(PHOTO_FOLDER_NAME);
  const file = folder.createFile(Utilities.newBlob(bytes, match[1], `${document}-${Date.now()}.${extension}`));
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return `https://drive.google.com/thumbnail?id=${file.getId()}&sz=w400`;
}

function validatePerson(payload, requiresPassword) {
  if (!payload.fullName || !payload.document || !payload.email || !payload.birthYear) throw new Error('Preencha os campos obrigatórios.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) throw new Error('E-mail inválido.');
  if (Number(payload.birthYear) < 1800 || Number(payload.birthYear) > new Date().getFullYear()) throw new Error('Ano de nascimento inválido.');
  if (requiresPassword && (!payload.password || payload.password.length < 8)) throw new Error('A senha deve ter ao menos 8 caracteres.');
  if (!requiresPassword && payload.newPassword && payload.newPassword.length < 8) throw new Error('A nova senha deve ter ao menos 8 caracteres.');
  const document = normalizeDocument(payload.document);
  if ([payload.fatherDocument, payload.motherDocument].map(normalizeDocument).includes(document)) throw new Error('Uma pessoa não pode ser seu próprio pai ou mãe.');
}

function hashPassword(password, salt) {
  const pepper = PropertiesService.getScriptProperties().getProperty('PASSWORD_PEPPER');
  if (!pepper) throw new Error('Configure PASSWORD_PEPPER nas propriedades do script.');
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, `${salt}:${password}:${pepper}`, Utilities.Charset.UTF_8);
  return Utilities.base64Encode(bytes);
}

function safeEquals(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}

function publicPerson(person) {
  const safe = { ...person };
  delete safe.passwordSalt;
  delete safe.passwordHash;
  return safe;
}

function normalizeDocument(value) {
  return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function cleanText(value, maxLength) {
  return String(value || '').trim().slice(0, maxLength);
}

function jsonResponse(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}
