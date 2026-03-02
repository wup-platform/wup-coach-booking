/**
 * Utils.gs
 * Funzioni di utilità generali per il sistema WUP Coach Booking.
 */

function generateId(prefix) {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 7).toUpperCase();
  return (prefix || 'ID') + '-' + timestamp + '-' + random;
}

function generateToken() {
  let token = '';
  for (let i = 0; i < 32; i++) {
    token += Math.floor(Math.random() * 16).toString(16);
  }
  return token;
}

function validateEmail(email) {
  if (!email || typeof email !== 'string') return false;
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return regex.test(email.trim());
}

function validateDateRange(start, end) {
  const now = new Date();
  if (!(start instanceof Date) || isNaN(start.getTime())) {
    return { valid: false, error: 'Data di inizio non valida.' };
  }
  if (!(end instanceof Date) || isNaN(end.getTime())) {
    return { valid: false, error: 'Data di fine non valida.' };
  }
  if (start >= end) {
    return { valid: false, error: 'La data di inizio deve essere precedente alla data di fine.' };
  }
  if (start <= now) {
    return { valid: false, error: 'Non è possibile prenotare uno slot nel passato.' };
  }
  const maxDate = new Date(now);
  maxDate.setDate(maxDate.getDate() + DAYS_AHEAD_MAX);
  if (start > maxDate) {
    return { valid: false, error: 'La prenotazione supera il limite massimo di ' + DAYS_AHEAD_MAX + ' giorni.' };
  }
  return { valid: true, error: null };
}

function acquireLock(timeoutMs) {
  const lock = LockService.getScriptLock();
  const acquired = lock.tryLock(timeoutMs || LOCK_TIMEOUT_MS);
  if (!acquired) {
    throw new Error('Impossibile acquisire il lock: il sistema è occupato. Riprova tra qualche secondo.');
  }
  return lock;
}

function releaseLock(lock) {
  try {
    if (lock) lock.releaseLock();
  } catch (err) {
    Logger.log('Attenzione: impossibile rilasciare il lock - ' + err.message);
  }
}

function logAudit(level, action, bookingId, message, payload) {
  try {
    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName(SHEETS.AUDIT);
    if (!sheet) return;
    sheet.appendRow([
      formatDatetime(new Date()),
      level || LOG_LEVEL.INFO,
      action || '',
      bookingId || '',
      message || '',
      payload ? JSON.stringify(payload) : ''
    ]);
  } catch (err) {
    Logger.log('[AUDIT FALLBACK] ' + level + ' | ' + action + ' | ' + message);
  }
}

function formatDatetime(date) {
  if (!date || !(date instanceof Date)) return '';
  return Utilities.formatDate(date, TIMEZONE, "yyyy-MM-dd'T'HH:mm:ssXXX");
}

function parseDateTime(str) {
  if (!str) throw new Error('Stringa data non fornita.');
  const date = new Date(str);
  if (isNaN(date.getTime())) throw new Error('Formato data non valido: ' + str);
  return date;
}

function successResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify({ success: true, data: data }))
    .setMimeType(ContentService.MimeType.JSON);
}

function errorResponse(message, code) {
  return ContentService
    .createTextOutput(JSON.stringify({ success: false, error: message || 'Errore.', code: code || 'GENERIC_ERROR' }))
    .setMimeType(ContentService.MimeType.JSON);
}

function formatDateItalian(date) {
  if (!date || !(date instanceof Date)) return '';
  const giorni = ['domenica','lunedì','martedì','mercoledì','giovedì','venerdì','sabato'];
  const mesi = ['gennaio','febbraio','marzo','aprile','maggio','giugno',
                'luglio','agosto','settembre','ottobre','novembre','dicembre'];
  const ore = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return giorni[date.getDay()] + ' ' + date.getDate() + ' ' + mesi[date.getMonth()] +
         ' ' + date.getFullYear() + ' alle ' + ore + ':' + min;
}

function sanitizeString(str) {
  if (!str || typeof str !== 'string') return '';
  return str.trim().replace(/[<>]/g, '');
}
