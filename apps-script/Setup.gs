/**
 * Setup.gs
 * Funzione di inizializzazione del sistema WUP Coach Booking.
 * Eseguire una volta sola prima del primo utilizzo.
 */

/**
 * Inizializza il Google Spreadsheet creando i fogli necessari
 * e impostando le intestazioni di ogni foglio.
 * Eseguire manualmente dall'editor Apps Script.
 */
function setup() {
  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);

    _setupCoachesSheet(ss);
    _setupBookingsSheet(ss);
    _setupAuditSheet(ss);

    logAudit(LOG_LEVEL.INFO, 'SETUP', '', 'Setup completato con successo', {
      timestamp: new Date().toISOString(),
      spreadsheetId: SPREADSHEET_ID
    });

    Logger.log('Setup WUP Coach Booking completato con successo.');

  } catch (err) {
    Logger.log('ERRORE durante il setup: ' + err.message);
    throw err;
  }
}

function _setupCoachesSheet(ss) {
  const headers = [
    'id', 'nome', 'cognome', 'email', 'ruolo', 'bio', 'foto_url',
    'calendar_managed_id', 'working_hours_start', 'working_hours_end',
    'slot_duration_min', 'active'
  ];
  const sheet = _getOrCreateSheet(ss, SHEETS.COACHES);
  _applyHeaders(sheet, headers);
}

function _setupBookingsSheet(ss) {
  const headers = [
    'booking_id', 'created_at', 'coach_id', 'coach_name', 'coach_email',
    'client_name', 'client_surname', 'client_email', 'client_phone',
    'start_datetime', 'end_datetime', 'timezone', 'notes', 'status',
    'cancel_token', 'event_id', 'calendar_id', 'cancelled_at'
  ];
  const sheet = _getOrCreateSheet(ss, SHEETS.BOOKINGS);
  _applyHeaders(sheet, headers);
}

function _setupAuditSheet(ss) {
  const headers = ['timestamp', 'level', 'action', 'booking_id', 'message', 'payload'];
  const sheet = _getOrCreateSheet(ss, SHEETS.AUDIT);
  _applyHeaders(sheet, headers);
}

function _getOrCreateSheet(ss, name) {
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    Logger.log('Foglio creato: ' + name);
  } else {
    Logger.log('Foglio già esistente: ' + name);
  }
  return sheet;
}

/**
 * Crea automaticamente un Google Calendar per ogni coach che non ha ancora
 * un calendar_managed_id, e scrive l'ID nel foglio Coaches.
 * Eseguire manualmente dall'editor Apps Script UNA SOLA VOLTA dopo setup().
 */
function setupCalendars() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(SHEETS.COACHES);
  const data = sheet.getDataRange().getValues();
  const headers = data[0];

  const colCalendarId = headers.indexOf('calendar_managed_id');
  const colNome      = headers.indexOf('nome');
  const colCognome   = headers.indexOf('cognome');
  const colId        = headers.indexOf('id');

  let creati = 0;
  let saltati = 0;

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const calId = row[colCalendarId];

    // Salta se ha già un Calendar ID valido
    if (calId && calId !== 'DA_INSERIRE' && calId.includes('@')) {
      saltati++;
      continue;
    }

    const nome    = row[colNome];
    const cognome = row[colCognome];
    const coachId = row[colId];
    const calName = 'Orientamento - ' + nome + ' ' + cognome;

    try {
      const cal = CalendarApp.createCalendar(calName, {
        summary: 'Calendario prenotazioni orientamento per ' + nome + ' ' + cognome,
        timeZone: TIMEZONE
      });

      // Scrivi il Calendar ID nel foglio
      sheet.getRange(i + 1, colCalendarId + 1).setValue(cal.getId());

      Logger.log('[OK] Creato: ' + calName + ' → ' + cal.getId());
      creati++;

      // Pausa per evitare rate limit di Google
      Utilities.sleep(500);

    } catch (err) {
      Logger.log('[ERRORE] Coach ' + coachId + ' (' + calName + '): ' + err.message);
    }
  }

  Logger.log('setupCalendars completato: ' + creati + ' creati, ' + saltati + ' già esistenti.');
  SpreadsheetApp.getUi().alert(
    'Calendari creati: ' + creati + '\nGià esistenti (saltati): ' + saltati
  );
}

/**
 * Sincronizza il foglio Coaches con le modifiche:
 * - Disattiva i coach rimossi dalla lista ufficiale
 * - Aggiunge i nuovi coach (Bertacchi, Bertuso, Cuoco, Lavorenti)
 * Eseguire UNA VOLTA SOLA dall'editor Apps Script.
 */
function syncCoaches() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(SHEETS.COACHES);
  const data = sheet.getDataRange().getValues();
  const headers = data[0];

  const colId     = headers.indexOf('id');
  const colActive = headers.indexOf('active');

  // Coach da disattivare
  const toDeactivate = [
    'coach_008', // Giuseppe Mirabile
    'coach_012', // Manuela Negro
    'coach_016', // Saverio Rodriguez
    'coach_019', // Andrea Garani
    'coach_020', // Pasquale Franzese
    'coach_021', // Vincenzo Carotenuto
    'coach_022', // Robert G. Allen
    'coach_023', // Alessandro Lombardi
  ];

  let disattivati = 0;
  for (let i = 1; i < data.length; i++) {
    if (toDeactivate.indexOf(data[i][colId]) !== -1) {
      sheet.getRange(i + 1, colActive + 1).setValue('FALSE');
      Logger.log('[DISATTIVATO] ' + data[i][colId]);
      disattivati++;
    }
  }

  // Nuovi coach da aggiungere (solo se non già presenti)
  const existingIds = data.slice(1).map(function(r) { return r[colId]; });
  const nuoviCoach = [
    ['coach_024','Christian','Bertacchi','christian.bertacchi@alfiobardolla.com','Coach','','','DA_INSERIRE','09:00','18:00',20,'TRUE'],
    ['coach_025','Giacomo','Bertuso','giacomo.bertuso@alfiobardolla.com','Coach','','','DA_INSERIRE','09:00','18:00',20,'TRUE'],
    ['coach_026','Carlo','Cuoco','carlo.cuoco@alfiobardolla.com','Coach','','','DA_INSERIRE','09:00','18:00',20,'TRUE'],
    ['coach_027','Paolo','Lavorenti','paolo.lavorenti@alfiobardolla.com','Coach','','','DA_INSERIRE','09:00','18:00',20,'TRUE'],
  ];

  let aggiunti = 0;
  nuoviCoach.forEach(function(row) {
    if (existingIds.indexOf(row[0]) === -1) {
      sheet.appendRow(row);
      Logger.log('[AGGIUNTO] ' + row[0] + ' - ' + row[1] + ' ' + row[2]);
      aggiunti++;
    } else {
      Logger.log('[GIA PRESENTE] ' + row[0]);
    }
  });

  SpreadsheetApp.getUi().alert(
    'Sync completato!\n' +
    'Disattivati: ' + disattivati + '\n' +
    'Aggiunti: ' + aggiunti + '\n\n' +
    'Ora esegui setupCalendars() per creare i calendari dei nuovi coach.'
  );
}

/**
 * Crea eventi di blocco nei calendari dei coach con disponibilità ridotta.
 *
 * Floriana Pagliano  → Sabato 14 marzo: mattina  (09:00-13:00)
 * Sabrina Lovallo    → Sabato 14 marzo: pomeriggio (13:00-18:00)
 * Giuseppe De Marco  → Domenica 15 marzo: mattina (09:00-13:00)
 * Emiliano Monza     → Domenica 15 marzo: mattina (09:00-13:00)
 *
 * Eseguire UNA VOLTA SOLA dall'editor Apps Script.
 */
function blockUnavailableSlots() {
  const ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(SHEETS.COACHES);
  const data  = sheet.getDataRange().getValues();
  const headers = data[0];

  const colId     = headers.indexOf('id');
  const colCalId  = headers.indexOf('calendar_managed_id');
  const colNome   = headers.indexOf('nome');
  const colCognome= headers.indexOf('cognome');

  // Mappa id → calendar_managed_id
  const calMap = {};
  for (let i = 1; i < data.length; i++) {
    calMap[data[i][colId]] = {
      calendarId: data[i][colCalId],
      nome: data[i][colNome] + ' ' + data[i][colCognome]
    };
  }

  const blocchi = [
    { coachId: 'coach_006', data: '2026-03-14', oraInizio: 9,  oraFine: 13, label: 'Floriana - sabato mattina' },
    { coachId: 'coach_015', data: '2026-03-14', oraInizio: 13, oraFine: 18, label: 'Sabrina - sabato pomeriggio' },
    { coachId: 'coach_007', data: '2026-03-15', oraInizio: 9,  oraFine: 13, label: 'Giuseppe - domenica mattina' },
    { coachId: 'coach_004', data: '2026-03-15', oraInizio: 9,  oraFine: 13, label: 'Emiliano - domenica mattina' },
  ];

  let ok = 0;
  let errori = [];

  blocchi.forEach(function(b) {
    const info = calMap[b.coachId];
    if (!info) { errori.push(b.label + ': coach non trovato'); return; }
    const calId = info.calendarId;
    if (!calId || calId === 'DA_INSERIRE' || !calId.includes('@')) {
      errori.push(b.label + ': calendar_id non valido (' + calId + ')');
      return;
    }

    try {
      const cal   = CalendarApp.getCalendarById(calId);
      const parti = b.data.split('-');
      const inizio = new Date(parseInt(parti[0]), parseInt(parti[1]) - 1, parseInt(parti[2]), b.oraInizio, 0, 0);
      const fine   = new Date(parseInt(parti[0]), parseInt(parti[1]) - 1, parseInt(parti[2]), b.oraFine,   0, 0);
      cal.createEvent('NON DISPONIBILE', inizio, fine);
      Logger.log('[OK] Blocco creato: ' + b.label);
      ok++;
    } catch (err) {
      errori.push(b.label + ': ' + err.message);
      Logger.log('[ERRORE] ' + b.label + ': ' + err.message);
    }
  });

  const msg = 'Blocchi creati: ' + ok + '/' + blocchi.length +
    (errori.length > 0 ? '\n\nErrori:\n' + errori.join('\n') : '\n\nTutto ok!');
  SpreadsheetApp.getUi().alert(msg);
}

function _applyHeaders(sheet, headers) {
  const headerRange = sheet.getRange(1, 1, 1, headers.length);
  headerRange.setValues([headers]);
  headerRange.setFontWeight('bold');
  headerRange.setBackground('#D3D3D3');
  headerRange.setHorizontalAlignment('center');
  sheet.setFrozenRows(1);
  for (let i = 1; i <= headers.length; i++) {
    sheet.autoResizeColumn(i);
  }
}
