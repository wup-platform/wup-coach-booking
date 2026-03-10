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
    'cancel_token', 'event_id', 'calendar_id', 'cancelled_at',
    'seller_id', 'seller_name'
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
    ['coach_024','Christian','Bertacchi','christian.bertacchi@alfiobardolla.com','Coach','','','DA_INSERIRE','08:15','19:15',15,'TRUE'],
    ['coach_025','Giacomo','Bertuso','giacomo.bertuso@alfiobardolla.com','Coach','','','DA_INSERIRE','08:15','19:15',15,'FALSE'],
    ['coach_026','Carlo','Cuoco','carlo.cuoco@alfiobardolla.com','Coach','','','DA_INSERIRE','08:15','19:15',15,'TRUE'],
    ['coach_027','Paolo','Lavorenti','paolo.lavorenti@alfiobardolla.com','Coach','','','DA_INSERIRE','08:15','19:15',15,'TRUE'],
    ['coach_028','Clara','Nicoloso','clara.nicoloso@alfiobardolla.com','Coach','','','DA_INSERIRE','08:15','19:15',15,'FALSE'],
    ['coach_029','Emanuele','Salvato','emanuele.salvato@smartbusinesslab.com','Mentor','','','DA_INSERIRE','08:15','19:15',15,'TRUE'],
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
 * Aggiunge Lombardi e Catan come nuovi coach e riattiva Rodriguez.
 * Eseguire UNA VOLTA SOLA dall'editor Apps Script.
 */
function syncCoachesV2() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(SHEETS.COACHES);
  const data = sheet.getDataRange().getValues();
  const headers = data[0];

  const colId     = headers.indexOf('id');
  const colActive = headers.indexOf('active');

  // Riattiva Rodriguez (coach_016)
  let riattivati = 0;
  for (let i = 1; i < data.length; i++) {
    if (data[i][colId] === 'coach_016') {
      sheet.getRange(i + 1, colActive + 1).setValue('TRUE');
      Logger.log('[RIATTIVATO] coach_016 - Rodriguez');
      riattivati++;
    }
  }

  // Nuovi coach
  const existingIds = data.slice(1).map(function(r) { return r[colId]; });
  const nuoviCoach = [
    ['coach_030','Alessandro','Lombardi','alessandro.lombardi@smartbusinesslab.com','Sales','','','DA_INSERIRE','09:00','17:55',15,'TRUE'],
    ['coach_031','Adrian','Catan','adrian.catan@smartbusinesslab.com','Sales','','','DA_INSERIRE','09:00','17:55',15,'TRUE'],
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
    'Sync V2 completato!\n' +
    'Riattivati: ' + riattivati + '\n' +
    'Aggiunti: ' + aggiunti + '\n\n' +
    'Ora esegui setupCalendars() per creare i calendari dei nuovi coach.'
  );
}

/**
 * STEP 1: Rimuove TUTTI gli eventi "NON DISPONIBILE" dai calendari coach
 * per i 3 giorni evento (13-14-15 marzo 2026).
 * Eseguire PRIMA di blockUnavailableSlots().
 */
function clearOldBlocks() {
  const ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(SHEETS.COACHES);
  const data  = sheet.getDataRange().getValues();
  const headers = data[0];

  const colId     = headers.indexOf('id');
  const colCalId  = headers.indexOf('calendar_managed_id');
  const colActive = headers.indexOf('active');

  const eventDays = ['2026-03-13', '2026-03-14', '2026-03-15'];
  let rimossi = 0;
  let errori = [];

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][colActive]).toUpperCase() !== 'TRUE') continue;
    const coachId = data[i][colId];
    const calId   = data[i][colCalId];
    if (!calId || calId === 'DA_INSERIRE' || !calId.includes('@')) continue;

    try {
      const cal = CalendarApp.getCalendarById(calId);
      if (!cal) continue;

      eventDays.forEach(function(dateStr) {
        const p = dateStr.split('-');
        const dayStart = new Date(parseInt(p[0]), parseInt(p[1]) - 1, parseInt(p[2]), 0, 0, 0);
        const dayEnd   = new Date(parseInt(p[0]), parseInt(p[1]) - 1, parseInt(p[2]), 23, 59, 59);
        var events = cal.getEvents(dayStart, dayEnd);
        events.forEach(function(ev) {
          if (ev.getTitle() === 'NON DISPONIBILE') {
            ev.deleteEvent();
            rimossi++;
            Logger.log('[RIMOSSO] ' + coachId + ' ' + dateStr + ' ' + ev.getStartTime());
          }
        });
      });
      Utilities.sleep(200);
    } catch (err) {
      errori.push(coachId + ': ' + err.message);
    }
  }

  const msg = 'Blocchi rimossi: ' + rimossi +
    (errori.length > 0 ? '\n\nErrori:\n' + errori.join('\n') : '\n\nTutto ok!');
  Logger.log(msg);
  SpreadsheetApp.getUi().alert(msg);
}

/**
 * Aggiorna working hours e slot duration di TUTTI i coach attivi
 * a 09:00–17:55, slot 15 minuti.
 * Eseguire UNA VOLTA per allineare i coach già esistenti nel foglio.
 */
function updateAllCoachWorkingHours() {
  const ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(SHEETS.COACHES);
  const data  = sheet.getDataRange().getValues();
  const headers = data[0].map(function(h){ return String(h).trim().toLowerCase(); });

  const colStart = headers.indexOf('working_hours_start');
  const colEnd   = headers.indexOf('working_hours_end');
  const colSlot  = headers.indexOf('slot_duration_min');

  if (colStart === -1 || colEnd === -1 || colSlot === -1) {
    Logger.log('ERRORE: colonne working_hours o slot_duration non trovate');
    return;
  }

  let updated = 0;
  for (let i = 1; i < data.length; i++) {
    sheet.getRange(i + 1, colStart + 1).setValue('09:00');
    sheet.getRange(i + 1, colEnd + 1).setValue('17:55');
    sheet.getRange(i + 1, colSlot + 1).setValue(15);
    updated++;
  }
  Logger.log('Aggiornati ' + updated + ' coach: 09:00-17:55, slot 15min');
}

/**
 * STEP 2: Crea eventi di blocco "NON DISPONIBILE" nei calendari coach
 * in base alla scaletta WUP Marzo 2026.
 *
 * Scaletta aggiornata: 13-14-15 marzo 2026
 * Orario sessioni: 09:00–17:55 (slot 15min + 5min pausa = step 20min)
 * Generato da meet_the_coach_schedule (5).xlsx — DEFINITIVO
 *
 * Eseguire DOPO clearOldBlocks().
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

  const calMap = {};
  for (let i = 1; i < data.length; i++) {
    calMap[data[i][colId]] = {
      calendarId: data[i][colCalId],
      nome: data[i][colNome] + ' ' + data[i][colCognome]
    };
  }

  // Formato: { coachId, data, hI, mI, hF, mF, label }
  // 197 blocchi da meet_the_coach_schedule (5).xlsx — DEFINITIVO
  var blocchi = [
    // ═══ VENERDI 13 MARZO ═══
    { coachId: 'coach_001', data: '2026-03-13', hI: 9, mI: 0, hF: 9, mF: 35, label: 'De Marco - ven 09:00-09:35' },
    { coachId: 'coach_001', data: '2026-03-13', hI: 11, mI: 40, hF: 12, mF: 15, label: 'De Marco - ven 11:40-12:15' },
    { coachId: 'coach_001', data: '2026-03-13', hI: 13, mI: 20, hF: 14, mF: 55, label: 'De Marco - ven 13:20-14:55' },
    { coachId: 'coach_001', data: '2026-03-13', hI: 16, mI: 40, hF: 17, mF: 15, label: 'De Marco - ven 16:40-17:15' },
    { coachId: 'coach_002', data: '2026-03-13', hI: 10, mI: 0, hF: 10, mF: 15, label: 'Garagiola - ven 10:00-10:15' },
    { coachId: 'coach_002', data: '2026-03-13', hI: 11, mI: 0, hF: 11, mF: 15, label: 'Garagiola - ven 11:00-11:15' },
    { coachId: 'coach_002', data: '2026-03-13', hI: 12, mI: 40, hF: 12, mF: 55, label: 'Garagiola - ven 12:40-12:55' },
    { coachId: 'coach_002', data: '2026-03-13', hI: 14, mI: 20, hF: 15, mF: 15, label: 'Garagiola - ven 14:20-15:15' },
    { coachId: 'coach_002', data: '2026-03-13', hI: 17, mI: 0, hF: 17, mF: 35, label: 'Garagiola - ven 17:00-17:35' },
    { coachId: 'coach_003', data: '2026-03-13', hI: 9, mI: 0, hF: 10, mF: 55, label: 'Colombo - ven 09:00-10:55' },
    { coachId: 'coach_003', data: '2026-03-13', hI: 13, mI: 20, hF: 15, mF: 15, label: 'Colombo - ven 13:20-15:15' },
    { coachId: 'coach_004', data: '2026-03-13', hI: 10, mI: 20, hF: 10, mF: 35, label: 'Pasetto - ven 10:20-10:35' },
    { coachId: 'coach_004', data: '2026-03-13', hI: 13, mI: 0, hF: 13, mF: 55, label: 'Pasetto - ven 13:00-13:55' },
    { coachId: 'coach_004', data: '2026-03-13', hI: 16, mI: 20, hF: 16, mF: 55, label: 'Pasetto - ven 16:20-16:55' },
    { coachId: 'coach_005', data: '2026-03-13', hI: 9, mI: 0, hF: 10, mF: 15, label: 'Monza - ven 09:00-10:15' },
    { coachId: 'coach_005', data: '2026-03-13', hI: 12, mI: 40, hF: 13, mF: 55, label: 'Monza - ven 12:40-13:55' },
    { coachId: 'coach_005', data: '2026-03-13', hI: 14, mI: 20, hF: 15, mF: 35, label: 'Monza - ven 14:20-15:35' },
    { coachId: 'coach_005', data: '2026-03-13', hI: 17, mI: 20, hF: 17, mF: 55, label: 'Monza - ven 17:20-17:55' },
    { coachId: 'coach_006', data: '2026-03-13', hI: 10, mI: 0, hF: 10, mF: 15, label: 'Marras - ven 10:00-10:15' },
    { coachId: 'coach_006', data: '2026-03-13', hI: 11, mI: 0, hF: 11, mF: 35, label: 'Marras - ven 11:00-11:35' },
    { coachId: 'coach_006', data: '2026-03-13', hI: 13, mI: 20, hF: 13, mF: 55, label: 'Marras - ven 13:20-13:55' },
    { coachId: 'coach_006', data: '2026-03-13', hI: 14, mI: 20, hF: 14, mF: 35, label: 'Marras - ven 14:20-14:35' },
    { coachId: 'coach_006', data: '2026-03-13', hI: 15, mI: 40, hF: 15, mF: 55, label: 'Marras - ven 15:40-15:55' },
    { coachId: 'coach_006', data: '2026-03-13', hI: 17, mI: 0, hF: 17, mF: 35, label: 'Marras - ven 17:00-17:35' },
    { coachId: 'coach_007', data: '2026-03-13', hI: 9, mI: 0, hF: 9, mF: 35, label: 'Pagliano - ven 09:00-09:35' },
    { coachId: 'coach_007', data: '2026-03-13', hI: 13, mI: 0, hF: 14, mF: 55, label: 'Pagliano - ven 13:00-14:55' },
    { coachId: 'coach_007', data: '2026-03-13', hI: 16, mI: 20, hF: 17, mF: 55, label: 'Pagliano - ven 16:20-17:55' },
    { coachId: 'coach_009', data: '2026-03-13', hI: 11, mI: 0, hF: 11, mF: 15, label: 'Ortelli - ven 11:00-11:15' },
    { coachId: 'coach_009', data: '2026-03-13', hI: 14, mI: 0, hF: 14, mF: 15, label: 'Ortelli - ven 14:00-14:15' },
    { coachId: 'coach_009', data: '2026-03-13', hI: 15, mI: 20, hF: 15, mF: 35, label: 'Ortelli - ven 15:20-15:35' },
    { coachId: 'coach_009', data: '2026-03-13', hI: 17, mI: 40, hF: 17, mF: 55, label: 'Ortelli - ven 17:40-17:55' },
    { coachId: 'coach_010', data: '2026-03-13', hI: 11, mI: 0, hF: 11, mF: 15, label: 'Redi - ven 11:00-11:15' },
    { coachId: 'coach_010', data: '2026-03-13', hI: 14, mI: 0, hF: 14, mF: 15, label: 'Redi - ven 14:00-14:15' },
    { coachId: 'coach_010', data: '2026-03-13', hI: 15, mI: 20, hF: 15, mF: 35, label: 'Redi - ven 15:20-15:35' },
    { coachId: 'coach_010', data: '2026-03-13', hI: 17, mI: 40, hF: 17, mF: 55, label: 'Redi - ven 17:40-17:55' },
    { coachId: 'coach_011', data: '2026-03-13', hI: 10, mI: 0, hF: 10, mF: 35, label: 'Fasciano - ven 10:00-10:35' },
    { coachId: 'coach_011', data: '2026-03-13', hI: 12, mI: 20, hF: 13, mF: 35, label: 'Fasciano - ven 12:20-13:35' },
    { coachId: 'coach_011', data: '2026-03-13', hI: 15, mI: 0, hF: 15, mF: 15, label: 'Fasciano - ven 15:00-15:15' },
    { coachId: 'coach_011', data: '2026-03-13', hI: 16, mI: 40, hF: 16, mF: 55, label: 'Fasciano - ven 16:40-16:55' },
    { coachId: 'coach_013', data: '2026-03-13', hI: 9, mI: 0, hF: 10, mF: 15, label: 'Sgambato - ven 09:00-10:15' },
    { coachId: 'coach_013', data: '2026-03-13', hI: 12, mI: 0, hF: 13, mF: 15, label: 'Sgambato - ven 12:00-13:15' },
    { coachId: 'coach_013', data: '2026-03-13', hI: 14, mI: 40, hF: 15, mF: 15, label: 'Sgambato - ven 14:40-15:15' },
    { coachId: 'coach_013', data: '2026-03-13', hI: 17, mI: 0, hF: 17, mF: 35, label: 'Sgambato - ven 17:00-17:35' },
    { coachId: 'coach_014', data: '2026-03-13', hI: 10, mI: 20, hF: 10, mF: 55, label: 'Acquistapace - ven 10:20-10:55' },
    { coachId: 'coach_014', data: '2026-03-13', hI: 12, mI: 0, hF: 12, mF: 55, label: 'Acquistapace - ven 12:00-12:55' },
    { coachId: 'coach_014', data: '2026-03-13', hI: 14, mI: 0, hF: 14, mF: 15, label: 'Acquistapace - ven 14:00-14:15' },
    { coachId: 'coach_014', data: '2026-03-13', hI: 15, mI: 20, hF: 15, mF: 55, label: 'Acquistapace - ven 15:20-15:55' },
    { coachId: 'coach_014', data: '2026-03-13', hI: 17, mI: 20, hF: 17, mF: 55, label: 'Acquistapace - ven 17:20-17:55' },
    { coachId: 'coach_015', data: '2026-03-13', hI: 9, mI: 0, hF: 15, mF: 55, label: 'Lovallo - ven 09:00-15:55' },
    { coachId: 'coach_016', data: '2026-03-13', hI: 9, mI: 0, hF: 14, mF: 15, label: 'Rodriguez - ven 09:00-14:15' },
    { coachId: 'coach_017', data: '2026-03-13', hI: 9, mI: 0, hF: 9, mF: 15, label: 'Crestan - ven 09:00-09:15' },
    { coachId: 'coach_017', data: '2026-03-13', hI: 13, mI: 40, hF: 14, mF: 55, label: 'Crestan - ven 13:40-14:55' },
    { coachId: 'coach_018', data: '2026-03-13', hI: 10, mI: 0, hF: 10, mF: 15, label: 'Migliaccio - ven 10:00-10:15' },
    { coachId: 'coach_018', data: '2026-03-13', hI: 12, mI: 40, hF: 12, mF: 55, label: 'Migliaccio - ven 12:40-12:55' },
    { coachId: 'coach_018', data: '2026-03-13', hI: 14, mI: 40, hF: 14, mF: 55, label: 'Migliaccio - ven 14:40-14:55' },
    { coachId: 'coach_018', data: '2026-03-13', hI: 16, mI: 20, hF: 16, mF: 35, label: 'Migliaccio - ven 16:20-16:35' },
    { coachId: 'coach_024', data: '2026-03-13', hI: 9, mI: 0, hF: 9, mF: 15, label: 'Bertacchi - ven 09:00-09:15' },
    { coachId: 'coach_024', data: '2026-03-13', hI: 11, mI: 0, hF: 11, mF: 35, label: 'Bertacchi - ven 11:00-11:35' },
    { coachId: 'coach_024', data: '2026-03-13', hI: 13, mI: 20, hF: 13, mF: 55, label: 'Bertacchi - ven 13:20-13:55' },
    { coachId: 'coach_024', data: '2026-03-13', hI: 16, mI: 0, hF: 16, mF: 55, label: 'Bertacchi - ven 16:00-16:55' },
    { coachId: 'coach_026', data: '2026-03-13', hI: 9, mI: 0, hF: 9, mF: 55, label: 'Cuoco - ven 09:00-09:55' },
    { coachId: 'coach_026', data: '2026-03-13', hI: 16, mI: 40, hF: 17, mF: 55, label: 'Cuoco - ven 16:40-17:55' },
    { coachId: 'coach_027', data: '2026-03-13', hI: 9, mI: 0, hF: 10, mF: 15, label: 'Lavorenti - ven 09:00-10:15' },
    { coachId: 'coach_027', data: '2026-03-13', hI: 12, mI: 40, hF: 13, mF: 55, label: 'Lavorenti - ven 12:40-13:55' },
    { coachId: 'coach_027', data: '2026-03-13', hI: 14, mI: 20, hF: 15, mF: 35, label: 'Lavorenti - ven 14:20-15:35' },
    { coachId: 'coach_027', data: '2026-03-13', hI: 17, mI: 20, hF: 17, mF: 55, label: 'Lavorenti - ven 17:20-17:55' },
    { coachId: 'coach_029', data: '2026-03-13', hI: 10, mI: 0, hF: 10, mF: 15, label: 'Salvato - ven 10:00-10:15' },
    { coachId: 'coach_029', data: '2026-03-13', hI: 12, mI: 40, hF: 12, mF: 55, label: 'Salvato - ven 12:40-12:55' },
    { coachId: 'coach_029', data: '2026-03-13', hI: 14, mI: 40, hF: 14, mF: 55, label: 'Salvato - ven 14:40-14:55' },
    { coachId: 'coach_029', data: '2026-03-13', hI: 16, mI: 20, hF: 16, mF: 35, label: 'Salvato - ven 16:20-16:35' },

    // ═══ SABATO 14 MARZO ═══
    { coachId: 'coach_001', data: '2026-03-14', hI: 9, mI: 0, hF: 9, mF: 55, label: 'De Marco - sab 09:00-09:55' },
    { coachId: 'coach_001', data: '2026-03-14', hI: 11, mI: 20, hF: 11, mF: 35, label: 'De Marco - sab 11:20-11:35' },
    { coachId: 'coach_001', data: '2026-03-14', hI: 12, mI: 40, hF: 13, mF: 55, label: 'De Marco - sab 12:40-13:55' },
    { coachId: 'coach_001', data: '2026-03-14', hI: 15, mI: 40, hF: 16, mF: 15, label: 'De Marco - sab 15:40-16:15' },
    { coachId: 'coach_002', data: '2026-03-14', hI: 10, mI: 20, hF: 10, mF: 35, label: 'Garagiola - sab 10:20-10:35' },
    { coachId: 'coach_002', data: '2026-03-14', hI: 12, mI: 20, hF: 13, mF: 35, label: 'Garagiola - sab 12:20-13:35' },
    { coachId: 'coach_003', data: '2026-03-14', hI: 9, mI: 0, hF: 15, mF: 15, label: 'Colombo - sab 09:00-15:15' },
    { coachId: 'coach_003', data: '2026-03-14', hI: 17, mI: 40, hF: 17, mF: 55, label: 'Colombo - sab 17:40-17:55' },
    { coachId: 'coach_004', data: '2026-03-14', hI: 10, mI: 20, hF: 10, mF: 35, label: 'Pasetto - sab 10:20-10:35' },
    { coachId: 'coach_004', data: '2026-03-14', hI: 11, mI: 40, hF: 11, mF: 55, label: 'Pasetto - sab 11:40-11:55' },
    { coachId: 'coach_004', data: '2026-03-14', hI: 13, mI: 40, hF: 14, mF: 55, label: 'Pasetto - sab 13:40-14:55' },
    { coachId: 'coach_004', data: '2026-03-14', hI: 16, mI: 40, hF: 17, mF: 15, label: 'Pasetto - sab 16:40-17:15' },
    { coachId: 'coach_005', data: '2026-03-14', hI: 9, mI: 0, hF: 9, mF: 55, label: 'Monza - sab 09:00-09:55' },
    { coachId: 'coach_005', data: '2026-03-14', hI: 11, mI: 20, hF: 11, mF: 35, label: 'Monza - sab 11:20-11:35' },
    { coachId: 'coach_005', data: '2026-03-14', hI: 13, mI: 0, hF: 14, mF: 35, label: 'Monza - sab 13:00-14:35' },
    { coachId: 'coach_005', data: '2026-03-14', hI: 16, mI: 0, hF: 16, mF: 35, label: 'Monza - sab 16:00-16:35' },
    { coachId: 'coach_006', data: '2026-03-14', hI: 11, mI: 0, hF: 11, mF: 35, label: 'Marras - sab 11:00-11:35' },
    { coachId: 'coach_006', data: '2026-03-14', hI: 13, mI: 0, hF: 14, mF: 15, label: 'Marras - sab 13:00-14:15' },
    { coachId: 'coach_006', data: '2026-03-14', hI: 16, mI: 0, hF: 16, mF: 55, label: 'Marras - sab 16:00-16:55' },
    { coachId: 'coach_007', data: '2026-03-14', hI: 9, mI: 0, hF: 16, mF: 15, label: 'Pagliano - sab 09:00-16:15' },
    { coachId: 'coach_007', data: '2026-03-14', hI: 17, mI: 40, hF: 17, mF: 55, label: 'Pagliano - sab 17:40-17:55' },
    { coachId: 'coach_009', data: '2026-03-14', hI: 10, mI: 0, hF: 10, mF: 15, label: 'Ortelli - sab 10:00-10:15' },
    { coachId: 'coach_009', data: '2026-03-14', hI: 11, mI: 20, hF: 11, mF: 55, label: 'Ortelli - sab 11:20-11:55' },
    { coachId: 'coach_009', data: '2026-03-14', hI: 14, mI: 0, hF: 14, mF: 15, label: 'Ortelli - sab 14:00-14:15' },
    { coachId: 'coach_009', data: '2026-03-14', hI: 15, mI: 20, hF: 16, mF: 15, label: 'Ortelli - sab 15:20-16:15' },
    { coachId: 'coach_010', data: '2026-03-14', hI: 9, mI: 0, hF: 9, mF: 15, label: 'Redi - sab 09:00-09:15' },
    { coachId: 'coach_010', data: '2026-03-14', hI: 10, mI: 40, hF: 10, mF: 55, label: 'Redi - sab 10:40-10:55' },
    { coachId: 'coach_010', data: '2026-03-14', hI: 12, mI: 40, hF: 13, mF: 15, label: 'Redi - sab 12:40-13:15' },
    { coachId: 'coach_010', data: '2026-03-14', hI: 15, mI: 20, hF: 16, mF: 15, label: 'Redi - sab 15:20-16:15' },
    { coachId: 'coach_011', data: '2026-03-14', hI: 9, mI: 0, hF: 9, mF: 35, label: 'Fasciano - sab 09:00-09:35' },
    { coachId: 'coach_011', data: '2026-03-14', hI: 11, mI: 40, hF: 12, mF: 15, label: 'Fasciano - sab 11:40-12:15' },
    { coachId: 'coach_011', data: '2026-03-14', hI: 13, mI: 40, hF: 14, mF: 55, label: 'Fasciano - sab 13:40-14:55' },
    { coachId: 'coach_011', data: '2026-03-14', hI: 17, mI: 0, hF: 17, mF: 35, label: 'Fasciano - sab 17:00-17:35' },
    { coachId: 'coach_013', data: '2026-03-14', hI: 11, mI: 0, hF: 11, mF: 35, label: 'Sgambato - sab 11:00-11:35' },
    { coachId: 'coach_013', data: '2026-03-14', hI: 13, mI: 20, hF: 14, mF: 15, label: 'Sgambato - sab 13:20-14:15' },
    { coachId: 'coach_013', data: '2026-03-14', hI: 15, mI: 40, hF: 16, mF: 15, label: 'Sgambato - sab 15:40-16:15' },
    { coachId: 'coach_013', data: '2026-03-14', hI: 17, mI: 40, hF: 17, mF: 55, label: 'Sgambato - sab 17:40-17:55' },
    { coachId: 'coach_014', data: '2026-03-14', hI: 9, mI: 0, hF: 10, mF: 35, label: 'Acquistapace - sab 09:00-10:35' },
    { coachId: 'coach_014', data: '2026-03-14', hI: 12, mI: 40, hF: 15, mF: 35, label: 'Acquistapace - sab 12:40-15:35' },
    { coachId: 'coach_014', data: '2026-03-14', hI: 17, mI: 20, hF: 17, mF: 55, label: 'Acquistapace - sab 17:20-17:55' },
    { coachId: 'coach_015', data: '2026-03-14', hI: 9, mI: 0, hF: 17, mF: 55, label: 'Lovallo - sab TUTTO IL GIORNO' },
    { coachId: 'coach_016', data: '2026-03-14', hI: 9, mI: 0, hF: 9, mF: 35, label: 'Rodriguez - sab 09:00-09:35' },
    { coachId: 'coach_016', data: '2026-03-14', hI: 12, mI: 40, hF: 17, mF: 55, label: 'Rodriguez - sab 12:40-17:55' },
    { coachId: 'coach_017', data: '2026-03-14', hI: 9, mI: 0, hF: 10, mF: 15, label: 'Crestan - sab 09:00-10:15' },
    { coachId: 'coach_017', data: '2026-03-14', hI: 14, mI: 20, hF: 15, mF: 15, label: 'Crestan - sab 14:20-15:15' },
    { coachId: 'coach_018', data: '2026-03-14', hI: 10, mI: 0, hF: 10, mF: 15, label: 'Migliaccio - sab 10:00-10:15' },
    { coachId: 'coach_018', data: '2026-03-14', hI: 11, mI: 20, hF: 11, mF: 55, label: 'Migliaccio - sab 11:20-11:55' },
    { coachId: 'coach_018', data: '2026-03-14', hI: 14, mI: 0, hF: 14, mF: 15, label: 'Migliaccio - sab 14:00-14:15' },
    { coachId: 'coach_018', data: '2026-03-14', hI: 15, mI: 20, hF: 16, mF: 15, label: 'Migliaccio - sab 15:20-16:15' },
    { coachId: 'coach_024', data: '2026-03-14', hI: 9, mI: 0, hF: 9, mF: 55, label: 'Bertacchi - sab 09:00-09:55' },
    { coachId: 'coach_026', data: '2026-03-14', hI: 9, mI: 0, hF: 14, mF: 55, label: 'Cuoco - sab 09:00-14:55' },
    { coachId: 'coach_027', data: '2026-03-14', hI: 9, mI: 0, hF: 9, mF: 55, label: 'Lavorenti - sab 09:00-09:55' },
    { coachId: 'coach_027', data: '2026-03-14', hI: 11, mI: 20, hF: 11, mF: 35, label: 'Lavorenti - sab 11:20-11:35' },
    { coachId: 'coach_027', data: '2026-03-14', hI: 13, mI: 0, hF: 14, mF: 35, label: 'Lavorenti - sab 13:00-14:35' },
    { coachId: 'coach_027', data: '2026-03-14', hI: 16, mI: 0, hF: 16, mF: 35, label: 'Lavorenti - sab 16:00-16:35' },
    { coachId: 'coach_029', data: '2026-03-14', hI: 9, mI: 0, hF: 9, mF: 15, label: 'Salvato - sab 09:00-09:15' },
    { coachId: 'coach_029', data: '2026-03-14', hI: 10, mI: 40, hF: 10, mF: 55, label: 'Salvato - sab 10:40-10:55' },
    { coachId: 'coach_029', data: '2026-03-14', hI: 12, mI: 40, hF: 13, mF: 15, label: 'Salvato - sab 12:40-13:15' },
    { coachId: 'coach_029', data: '2026-03-14', hI: 15, mI: 20, hF: 16, mF: 15, label: 'Salvato - sab 15:20-16:15' },

    // ═══ DOMENICA 15 MARZO ═══
    { coachId: 'coach_001', data: '2026-03-15', hI: 9, mI: 0, hF: 14, mF: 35, label: 'De Marco - dom 09:00-14:35' },
    { coachId: 'coach_002', data: '2026-03-15', hI: 10, mI: 0, hF: 11, mF: 55, label: 'Garagiola - dom 10:00-11:55' },
    { coachId: 'coach_002', data: '2026-03-15', hI: 13, mI: 20, hF: 14, mF: 15, label: 'Garagiola - dom 13:20-14:15' },
    { coachId: 'coach_002', data: '2026-03-15', hI: 15, mI: 40, hF: 15, mF: 55, label: 'Garagiola - dom 15:40-15:55' },
    { coachId: 'coach_002', data: '2026-03-15', hI: 16, mI: 40, hF: 17, mF: 15, label: 'Garagiola - dom 16:40-17:15' },
    { coachId: 'coach_003', data: '2026-03-15', hI: 9, mI: 0, hF: 11, mF: 35, label: 'Colombo - dom 09:00-11:35' },
    { coachId: 'coach_003', data: '2026-03-15', hI: 13, mI: 40, hF: 15, mF: 15, label: 'Colombo - dom 13:40-15:15' },
    { coachId: 'coach_004', data: '2026-03-15', hI: 9, mI: 0, hF: 9, mF: 35, label: 'Pasetto - dom 09:00-09:35' },
    { coachId: 'coach_004', data: '2026-03-15', hI: 10, mI: 40, hF: 11, mF: 55, label: 'Pasetto - dom 10:40-11:55' },
    { coachId: 'coach_004', data: '2026-03-15', hI: 12, mI: 40, hF: 13, mF: 35, label: 'Pasetto - dom 12:40-13:35' },
    { coachId: 'coach_004', data: '2026-03-15', hI: 15, mI: 0, hF: 15, mF: 35, label: 'Pasetto - dom 15:00-15:35' },
    { coachId: 'coach_004', data: '2026-03-15', hI: 17, mI: 0, hF: 17, mF: 55, label: 'Pasetto - dom 17:00-17:55' },
    { coachId: 'coach_005', data: '2026-03-15', hI: 9, mI: 0, hF: 9, mF: 15, label: 'Monza - dom 09:00-09:15' },
    { coachId: 'coach_005', data: '2026-03-15', hI: 10, mI: 40, hF: 11, mF: 55, label: 'Monza - dom 10:40-11:55' },
    { coachId: 'coach_005', data: '2026-03-15', hI: 13, mI: 40, hF: 14, mF: 35, label: 'Monza - dom 13:40-14:35' },
    { coachId: 'coach_005', data: '2026-03-15', hI: 16, mI: 0, hF: 16, mF: 15, label: 'Monza - dom 16:00-16:15' },
    { coachId: 'coach_005', data: '2026-03-15', hI: 17, mI: 40, hF: 17, mF: 55, label: 'Monza - dom 17:40-17:55' },
    { coachId: 'coach_006', data: '2026-03-15', hI: 10, mI: 40, hF: 11, mF: 55, label: 'Marras - dom 10:40-11:55' },
    { coachId: 'coach_006', data: '2026-03-15', hI: 12, mI: 40, hF: 13, mF: 35, label: 'Marras - dom 12:40-13:35' },
    { coachId: 'coach_006', data: '2026-03-15', hI: 15, mI: 20, hF: 15, mF: 55, label: 'Marras - dom 15:20-15:55' },
    { coachId: 'coach_006', data: '2026-03-15', hI: 16, mI: 40, hF: 17, mF: 15, label: 'Marras - dom 16:40-17:15' },
    { coachId: 'coach_007', data: '2026-03-15', hI: 9, mI: 0, hF: 11, mF: 15, label: 'Pagliano - dom 09:00-11:15' },
    { coachId: 'coach_007', data: '2026-03-15', hI: 13, mI: 40, hF: 16, mF: 55, label: 'Pagliano - dom 13:40-16:55' },
    { coachId: 'coach_009', data: '2026-03-15', hI: 10, mI: 20, hF: 10, mF: 35, label: 'Ortelli - dom 10:20-10:35' },
    { coachId: 'coach_009', data: '2026-03-15', hI: 12, mI: 0, hF: 12, mF: 15, label: 'Ortelli - dom 12:00-12:15' },
    { coachId: 'coach_009', data: '2026-03-15', hI: 13, mI: 40, hF: 14, mF: 35, label: 'Ortelli - dom 13:40-14:35' },
    { coachId: 'coach_009', data: '2026-03-15', hI: 16, mI: 20, hF: 16, mF: 55, label: 'Ortelli - dom 16:20-16:55' },
    { coachId: 'coach_010', data: '2026-03-15', hI: 9, mI: 0, hF: 9, mF: 35, label: 'Redi - dom 09:00-09:35' },
    { coachId: 'coach_010', data: '2026-03-15', hI: 11, mI: 0, hF: 11, mF: 35, label: 'Redi - dom 11:00-11:35' },
    { coachId: 'coach_010', data: '2026-03-15', hI: 13, mI: 0, hF: 13, mF: 35, label: 'Redi - dom 13:00-13:35' },
    { coachId: 'coach_010', data: '2026-03-15', hI: 15, mI: 0, hF: 15, mF: 35, label: 'Redi - dom 15:00-15:35' },
    { coachId: 'coach_011', data: '2026-03-15', hI: 9, mI: 0, hF: 9, mF: 35, label: 'Fasciano - dom 09:00-09:35' },
    { coachId: 'coach_011', data: '2026-03-15', hI: 10, mI: 40, hF: 11, mF: 55, label: 'Fasciano - dom 10:40-11:55' },
    { coachId: 'coach_011', data: '2026-03-15', hI: 13, mI: 0, hF: 13, mF: 55, label: 'Fasciano - dom 13:00-13:55' },
    { coachId: 'coach_011', data: '2026-03-15', hI: 16, mI: 0, hF: 16, mF: 35, label: 'Fasciano - dom 16:00-16:35' },
    { coachId: 'coach_013', data: '2026-03-15', hI: 9, mI: 0, hF: 9, mF: 35, label: 'Sgambato - dom 09:00-09:35' },
    { coachId: 'coach_013', data: '2026-03-15', hI: 10, mI: 40, hF: 11, mF: 55, label: 'Sgambato - dom 10:40-11:55' },
    { coachId: 'coach_013', data: '2026-03-15', hI: 13, mI: 40, hF: 14, mF: 35, label: 'Sgambato - dom 13:40-14:35' },
    { coachId: 'coach_013', data: '2026-03-15', hI: 16, mI: 40, hF: 17, mF: 15, label: 'Sgambato - dom 16:40-17:15' },
    { coachId: 'coach_014', data: '2026-03-15', hI: 9, mI: 0, hF: 11, mF: 55, label: 'Acquistapace - dom 09:00-11:55' },
    { coachId: 'coach_014', data: '2026-03-15', hI: 13, mI: 20, hF: 14, mF: 35, label: 'Acquistapace - dom 13:20-14:35' },
    { coachId: 'coach_014', data: '2026-03-15', hI: 16, mI: 0, hF: 16, mF: 15, label: 'Acquistapace - dom 16:00-16:15' },
    { coachId: 'coach_014', data: '2026-03-15', hI: 17, mI: 20, hF: 17, mF: 55, label: 'Acquistapace - dom 17:20-17:55' },
    { coachId: 'coach_015', data: '2026-03-15', hI: 9, mI: 0, hF: 10, mF: 55, label: 'Lovallo - dom 09:00-10:55' },
    { coachId: 'coach_015', data: '2026-03-15', hI: 13, mI: 40, hF: 17, mF: 55, label: 'Lovallo - dom 13:40-17:55' },
    { coachId: 'coach_016', data: '2026-03-15', hI: 9, mI: 0, hF: 9, mF: 35, label: 'Rodriguez - dom 09:00-09:35' },
    { coachId: 'coach_016', data: '2026-03-15', hI: 12, mI: 40, hF: 13, mF: 55, label: 'Rodriguez - dom 12:40-13:55' },
    { coachId: 'coach_016', data: '2026-03-15', hI: 15, mI: 20, hF: 15, mF: 35, label: 'Rodriguez - dom 15:20-15:35' },
    { coachId: 'coach_016', data: '2026-03-15', hI: 17, mI: 20, hF: 17, mF: 35, label: 'Rodriguez - dom 17:20-17:35' },
    { coachId: 'coach_017', data: '2026-03-15', hI: 9, mI: 0, hF: 10, mF: 15, label: 'Crestan - dom 09:00-10:15' },
    { coachId: 'coach_017', data: '2026-03-15', hI: 14, mI: 20, hF: 15, mF: 15, label: 'Crestan - dom 14:20-15:15' },
    { coachId: 'coach_018', data: '2026-03-15', hI: 9, mI: 0, hF: 9, mF: 35, label: 'Migliaccio - dom 09:00-09:35' },
    { coachId: 'coach_018', data: '2026-03-15', hI: 11, mI: 0, hF: 11, mF: 35, label: 'Migliaccio - dom 11:00-11:35' },
    { coachId: 'coach_018', data: '2026-03-15', hI: 13, mI: 0, hF: 13, mF: 35, label: 'Migliaccio - dom 13:00-13:35' },
    { coachId: 'coach_018', data: '2026-03-15', hI: 15, mI: 0, hF: 15, mF: 35, label: 'Migliaccio - dom 15:00-15:35' },
    { coachId: 'coach_024', data: '2026-03-15', hI: 10, mI: 40, hF: 11, mF: 55, label: 'Bertacchi - dom 10:40-11:55' },
    { coachId: 'coach_024', data: '2026-03-15', hI: 14, mI: 0, hF: 14, mF: 55, label: 'Bertacchi - dom 14:00-14:55' },
    { coachId: 'coach_024', data: '2026-03-15', hI: 16, mI: 20, hF: 17, mF: 15, label: 'Bertacchi - dom 16:20-17:15' },
    { coachId: 'coach_026', data: '2026-03-15', hI: 9, mI: 0, hF: 12, mF: 15, label: 'Cuoco - dom 09:00-12:15' },
    { coachId: 'coach_027', data: '2026-03-15', hI: 9, mI: 0, hF: 9, mF: 15, label: 'Lavorenti - dom 09:00-09:15' },
    { coachId: 'coach_027', data: '2026-03-15', hI: 10, mI: 40, hF: 11, mF: 55, label: 'Lavorenti - dom 10:40-11:55' },
    { coachId: 'coach_027', data: '2026-03-15', hI: 13, mI: 40, hF: 14, mF: 35, label: 'Lavorenti - dom 13:40-14:35' },
    { coachId: 'coach_027', data: '2026-03-15', hI: 16, mI: 0, hF: 16, mF: 15, label: 'Lavorenti - dom 16:00-16:15' },
    { coachId: 'coach_027', data: '2026-03-15', hI: 17, mI: 40, hF: 17, mF: 55, label: 'Lavorenti - dom 17:40-17:55' },
    { coachId: 'coach_029', data: '2026-03-15', hI: 10, mI: 20, hF: 10, mF: 35, label: 'Salvato - dom 10:20-10:35' },
    { coachId: 'coach_029', data: '2026-03-15', hI: 12, mI: 0, hF: 12, mF: 15, label: 'Salvato - dom 12:00-12:15' },
    { coachId: 'coach_029', data: '2026-03-15', hI: 13, mI: 40, hF: 14, mF: 35, label: 'Salvato - dom 13:40-14:35' },
    { coachId: 'coach_029', data: '2026-03-15', hI: 16, mI: 20, hF: 16, mF: 55, label: 'Salvato - dom 16:20-16:55' },
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
      const inizio = new Date(parseInt(parti[0]), parseInt(parti[1]) - 1, parseInt(parti[2]), b.hI, b.mI, 0);
      const fine   = new Date(parseInt(parti[0]), parseInt(parti[1]) - 1, parseInt(parti[2]), b.hF, b.mF, 0);
      cal.createEvent('NON DISPONIBILE', inizio, fine);
      Logger.log('[OK] Blocco creato: ' + b.label);
      ok++;
      Utilities.sleep(200);
    } catch (err) {
      errori.push(b.label + ': ' + err.message);
      Logger.log('[ERRORE] ' + b.label + ': ' + err.message);
    }
  });

  const msg = 'Blocchi creati: ' + ok + '/' + blocchi.length +
    (errori.length > 0 ? '\n\nErrori:\n' + errori.join('\n') : '\n\nTutto ok!');
  Logger.log(msg);
  SpreadsheetApp.getUi().alert(msg);
}

/**
 * Aggiunge la colonna dashboard_token al foglio Coaches (se non esiste),
 * genera un token per ogni coach attivo e invia via email i link personali.
 * Al termine logga e invia all'ADMIN_EMAIL la lista completa di URL.
 * Eseguire UNA SOLA VOLTA dall'editor Apps Script.
 */
function generateDashboardTokens() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(SHEETS.COACHES);
  const data = sheet.getDataRange().getValues();
  const headers = data[0];

  // Aggiungi colonna dashboard_token se non esiste
  let colToken = headers.indexOf('dashboard_token');
  if (colToken === -1) {
    colToken = headers.length;
    sheet.getRange(1, colToken + 1).setValue('dashboard_token');
    sheet.getRange(1, colToken + 1).setFontWeight('bold').setBackground('#D3D3D3');
    Logger.log('Colonna dashboard_token aggiunta in posizione ' + (colToken + 1));
  }

  const colId      = headers.indexOf('id');
  const colNome    = headers.indexOf('nome');
  const colCognome = headers.indexOf('cognome');
  const colActive  = headers.indexOf('active');

  const DASHBOARD_BASE_URL = 'https://wup-platform.github.io/wup-coach-dashboard/coach.html';
  const urlList = [];
  let generati = 0;

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const active = String(row[colActive]).toUpperCase();
    if (active !== 'TRUE') continue;

    const coachId  = String(row[colId]);
    const nome     = String(row[colNome]);
    const cognome  = String(row[colCognome]);

    // Salta se il token esiste già (per evitare rinnovo accidentale)
    const existingToken = String(row[colToken] !== undefined ? row[colToken] : '').trim();
    let token;
    if (existingToken.length > 0) {
      token = existingToken;
      Logger.log('[SKIP] Token già presente per ' + coachId);
    } else {
      token = generateToken();
      sheet.getRange(i + 1, colToken + 1).setValue(token);
    }

    const url = DASHBOARD_BASE_URL + '?id=' + encodeURIComponent(coachId) + '&token=' + token;
    urlList.push({ coachId: coachId, nome: nome + ' ' + cognome, url: url });

    // Invia email al coach solo se il token è nuovo
    if (existingToken.length === 0) {
      const coach = _rowToCoachFromRow(headers, row);
      coach.dashboard_token = token;
      try {
        sendDashboardLinkToCoach(coach, url);
      } catch (e) {
        Logger.log('[WARN] Email non inviata a ' + coach.email + ': ' + e.message);
      }
    }

    generati++;
    Utilities.sleep(300);
  }

  // Email riepilogo all'admin
  const adminBody = urlList.map(function(u) {
    return u.coachId + ' — ' + u.nome + '\n' + u.url;
  }).join('\n\n');
  const adminHtml = '<h2 style="color:#E57711">Dashboard Coach — Link generati</h2>' +
    '<p>Generati ' + generati + ' token. Lista URL:</p>' +
    '<table style="border-collapse:collapse;width:100%">' +
    urlList.map(function(u) {
      return '<tr style="border-bottom:1px solid #eee"><td style="padding:8px;font-weight:bold">' +
        u.nome + '</td><td style="padding:8px"><a href="' + u.url + '">' + u.url + '</a></td></tr>';
    }).join('') +
    '</table>';
  GmailApp.sendEmail(
    ADMIN_EMAIL,
    '[WUP] Dashboard coach — link generati (' + generati + ')',
    adminBody,
    { from: SENDER_EMAIL, name: SENDER_NAME, htmlBody: buildEmailTemplate('Link Dashboard Coach', adminHtml) }
  );

  Logger.log('generateDashboardTokens completato: ' + generati + ' coach aggiornati.');
  SpreadsheetApp.getUi().alert('Token generati: ' + generati + '\nEmail inviate ai coach e riepilogo inviato ad admin.');
}

// Helper interno usato da generateDashboardTokens
function _rowToCoachFromRow(headers, row) {
  const coach = {};
  headers.forEach(function(h, i) { coach[h] = row[i]; });
  return coach;
}

/**
 * Copia il Google Spreadsheet su Google Drive nella cartella 'WUP Coach Backup'.
 * Nomina il file con la data odierna: "WUP Backup YYYY-MM-DD".
 * Configurare come trigger giornaliero con setupDailyBackupTrigger().
 */
function backupBookingsToGoogleDrive() {
  try {
    const today      = new Date();
    const dateStr    = Utilities.formatDate(today, TIMEZONE, 'yyyy-MM-dd');
    const fileName   = 'WUP Backup ' + dateStr;
    const folderName = 'WUP Coach Backup';

    // Trova o crea la cartella di backup
    let folder;
    const folders = DriveApp.getFoldersByName(folderName);
    if (folders.hasNext()) {
      folder = folders.next();
    } else {
      folder = DriveApp.createFolder(folderName);
      Logger.log('[BACKUP] Cartella creata: ' + folderName);
    }

    // Evita backup duplicati per la stessa data
    const existing = folder.getFilesByName(fileName);
    if (existing.hasNext()) {
      Logger.log('[BACKUP] Backup già presente per ' + dateStr + ', skip.');
      return;
    }

    // Copia lo spreadsheet nella cartella
    const file = DriveApp.getFileById(SPREADSHEET_ID);
    file.makeCopy(fileName, folder);

    Logger.log('[BACKUP] Backup completato: ' + fileName);
    logAudit(LOG_LEVEL.INFO, 'BACKUP', '', 'Backup giornaliero completato: ' + fileName, {});
  } catch (err) {
    Logger.log('[BACKUP] ERRORE: ' + err.message);
    logAudit(LOG_LEVEL.ERROR, 'BACKUP', '', err.message, {});
    sendAdminAlert('Errore backup giornaliero', err.message);
  }
}

/**
 * Crea un trigger giornaliero alle 03:00 per backupBookingsToGoogleDrive().
 * Eseguire UNA SOLA VOLTA dall'editor Apps Script.
 */
function setupDailyBackupTrigger() {
  // Evita trigger duplicati
  const triggers = ScriptApp.getProjectTriggers();
  for (let i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'backupBookingsToGoogleDrive') {
      Logger.log('[TRIGGER] Trigger backup già esistente, skip.');
      SpreadsheetApp.getUi().alert('Trigger backup già presente. Nessuna modifica.');
      return;
    }
  }

  ScriptApp.newTrigger('backupBookingsToGoogleDrive')
    .timeBased()
    .atHour(3)
    .everyDays(1)
    .create();

  Logger.log('[TRIGGER] Trigger backup giornaliero creato alle 03:00.');
  SpreadsheetApp.getUi().alert('Trigger backup creato!\nBackup automatico ogni giorno alle 03:00.');
}

/**
 * Esporta tutte le prenotazioni (Bookings) come CSV e invia all'ADMIN_EMAIL.
 * Esclude le colonne sensibili: cancel_token.
 * Eseguire manualmente dall'editor Apps Script quando serve un export.
 */
function exportBookingsCSV() {
  try {
    const ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(SHEETS.BOOKINGS);
    const data  = sheet.getDataRange().getValues();

    if (data.length === 0) {
      Logger.log('[EXPORT] Nessun dato da esportare.');
      return;
    }

    const headers     = data[0];
    const excludeCols = ['cancel_token'];
    const keepCols    = [];
    headers.forEach(function(h, i) {
      if (excludeCols.indexOf(h) === -1) keepCols.push(i);
    });

    // Costruisci CSV con escaping corretto
    const csvRows = data.map(function(row) {
      return keepCols.map(function(ci) {
        const val = row[ci] !== null && row[ci] !== undefined ? String(row[ci]) : '';
        if (val.indexOf(',') !== -1 || val.indexOf('\n') !== -1 || val.indexOf('"') !== -1) {
          return '"' + val.replace(/"/g, '""') + '"';
        }
        return val;
      }).join(',');
    });

    const csvContent = csvRows.join('\n');
    const dateStr    = Utilities.formatDate(new Date(), TIMEZONE, 'yyyy-MM-dd_HHmm');
    const fileName   = 'WUP_Bookings_Export_' + dateStr + '.csv';
    const blob       = Utilities.newBlob(csvContent, 'text/csv', fileName);

    GmailApp.sendEmail(
      ADMIN_EMAIL,
      '[WUP] Export prenotazioni ' + dateStr,
      'In allegato l\'export completo delle prenotazioni WUP Coach Booking.\n\nTotale righe (inclusa intestazione): ' + data.length,
      { from: SENDER_EMAIL, name: SENDER_NAME, attachments: [blob] }
    );

    Logger.log('[EXPORT] CSV inviato ad ' + ADMIN_EMAIL + ': ' + data.length + ' righe.');
    SpreadsheetApp.getUi().alert('Export completato!\n' + (data.length - 1) + ' prenotazioni inviate via email a ' + ADMIN_EMAIL);
  } catch (err) {
    Logger.log('[EXPORT] ERRORE: ' + err.message);
    SpreadsheetApp.getUi().alert('ERRORE export: ' + err.message);
  }
}

/**
 * Protegge il foglio Coaches: solo ADMIN_EMAIL può modificarlo.
 * Gli altri utenti possono visualizzare ma non modificare.
 * Eseguire UNA SOLA VOLTA dall'editor Apps Script.
 */
function protectCoachesSheet() {
  try {
    const ss    = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(SHEETS.COACHES);

    // Rimuovi protezioni esistenti
    const existing = sheet.getProtections(SpreadsheetApp.ProtectionType.SHEET);
    existing.forEach(function(p) { p.remove(); });

    const protection = sheet.protect();
    protection.setDescription('Foglio Coaches — solo admin WUP');

    // Rimuovi tutti gli editor eccetto il proprietario del progetto
    protection.removeEditors(protection.getEditors());

    // Aggiungi admin come editor esplicito
    protection.addEditor(ADMIN_EMAIL);

    Logger.log('[PROTECT] Foglio Coaches protetto. Editor: ' + ADMIN_EMAIL);
    SpreadsheetApp.getUi().alert(
      'Foglio Coaches protetto!\n' +
      'Solo ' + ADMIN_EMAIL + ' può modificarlo.\n' +
      'Gli altri utenti possono solo visualizzarlo.'
    );
  } catch (err) {
    Logger.log('[PROTECT] ERRORE: ' + err.message);
    SpreadsheetApp.getUi().alert('ERRORE protezione: ' + err.message);
  }
}

/**
 * Crea il foglio "Sellers" con 26 venditori e genera un dashboard_token per ognuno.
 * Eseguire UNA SOLA VOLTA dall'editor Apps Script.
 */
function setupSellers() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = _getOrCreateSheet(ss, SHEETS.SELLERS);
  const headers = ['id', 'nome', 'cognome', 'email', 'dashboard_token', 'active'];
  _applyHeaders(sheet, headers);

  const sellers = [
    ['seller_001', 'Alberto',    'Romeo',          'alberto.romeo@alfiobardolla.com'],
    ['seller_002', 'Aldo',       'Costarella',     'aldo.costarella@alfiobardolla.com'],
    ['seller_003', 'Alessandro', 'Lazzara',        'alessandro.lazzara@alfiobardolla.com'],
    ['seller_004', 'Alexia',     'Seveso',         'alexia.seveso@alfiobardolla.com'],
    ['seller_005', 'Antonluca',  'Avagliano',      'antonluca.avagliano@alfiobardolla.com'],
    ['seller_006', 'Barbara',    'Licciardello',   'barbara.licciardello@alfiobardolla.com'],
    ['seller_007', 'Davide',     'Chesi',          'davide.chesi@alfiobardolla.com'],
    ['seller_008', 'Elena',      'Giordano',       'elena.giordano@alfiobardolla.com'],
    ['seller_009', 'Emanuela',   'Brunetti',       'emanuela.brunetti@alfiobardolla.com'],
    ['seller_010', 'Ester',      'Cascino',        'ester.cascino@alfiobardolla.com'],
    ['seller_011', 'Fabrizio',   'Badino',         'fabrizio.badino@alfiobardolla.com'],
    ['seller_012', 'Federica',   'Picicco',        'federica.picicco@alfiobardolla.com'],
    ['seller_013', 'Federico',   'Chesi',          'federico.chesi@alfiobardolla.com'],
    ['seller_014', 'Filippo',    'Assiani',        'filippo.assiani@alfiobardolla.com'],
    ['seller_015', 'Giada',      'Antonelli',      'giada.antonelli@alfiobardolla.com'],
    ['seller_016', 'Giovanni',   'Miniati',        'giovanni.miniati@alfiobardolla.com'],
    ['seller_017', 'Girolamo',   'Simonetta',      'girolamo.simonetta@alfiobardolla.com'],
    ['seller_018', 'Giulio',     'Montis',         'giulio.montis@alfiobardolla.com'],
    ['seller_019', 'Giuseppe',   'Bernardo',       'giuseppe.bernardo@alfiobardolla.com'],
    ['seller_020', 'Lorena',     'La Ferrera',     'lorena.laferrera@alfiobardolla.com'],
    ['seller_021', 'Luca',       'Motti',          'luca.motti@alfiobardolla.com'],
    ['seller_022', 'Matteo',     'Carozza',        'matteo.carozza@alfiobardolla.com'],
    ['seller_023', 'Matteo',     'Schiavone',      'matteo.schiavone@alfiobardolla.com'],
    ['seller_024', 'Miriam',     'Brandoni',       'miriam.brandoni@alfiobardolla.com'],
    ['seller_025', 'Stefano',    'Chiodini',       'stefano.chiodini@alfiobardolla.com'],
    ['seller_026', 'Valerio',    'Piras',          'valerio.piras@alfiobardolla.com']
  ];

  // Controlla seller già presenti per evitare duplicati
  const existingData = sheet.getDataRange().getValues();
  const existingIds = existingData.slice(1).map(function(r) { return String(r[0]); });

  let aggiunti = 0;
  sellers.forEach(function(s) {
    if (existingIds.indexOf(s[0]) !== -1) {
      Logger.log('[GIA PRESENTE] ' + s[0]);
      return;
    }
    const token = generateToken();
    sheet.appendRow([s[0], s[1], s[2], s[3], token, 'TRUE']);
    aggiunti++;
  });

  Logger.log('setupSellers completato: ' + aggiunti + ' venditori inseriti.');
  SpreadsheetApp.getUi().alert('Sellers creati: ' + aggiunti);
}

/**
 * Genera i dashboard_token per i seller (se mancanti) e invia i link via email.
 * Simile a generateDashboardTokens() ma per i venditori.
 * Dashboard URL: https://wup-platform.github.io/wup-coach-dashboard/seller.html
 * Eseguire UNA SOLA VOLTA dall'editor Apps Script.
 */
function generateSellerDashboardTokens() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(SHEETS.SELLERS);
  if (!sheet) {
    Logger.log('Foglio Sellers non trovato. Esegui prima setupSellers().');
    return;
  }
  const data = sheet.getDataRange().getValues();
  const headers = data[0];

  const colId      = headers.indexOf('id');
  const colNome    = headers.indexOf('nome');
  const colCognome = headers.indexOf('cognome');
  const colEmail   = headers.indexOf('email');
  const colToken   = headers.indexOf('dashboard_token');
  const colActive  = headers.indexOf('active');

  const DASHBOARD_BASE_URL = 'https://wup-platform.github.io/wup-coach-dashboard/seller.html';
  const urlList = [];
  let generati = 0;

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    const active = String(row[colActive]).toUpperCase();
    if (active !== 'TRUE') continue;

    const sellerId = String(row[colId]);
    const nome     = String(row[colNome]);
    const cognome  = String(row[colCognome]);
    const email    = String(row[colEmail]);

    // Salta se il token esiste già
    const existingToken = String(row[colToken] !== undefined ? row[colToken] : '').trim();
    let token;
    if (existingToken.length > 0) {
      token = existingToken;
      Logger.log('[SKIP] Token già presente per ' + sellerId);
    } else {
      token = generateToken();
      sheet.getRange(i + 1, colToken + 1).setValue(token);
    }

    const url = DASHBOARD_BASE_URL + '?id=' + encodeURIComponent(sellerId) + '&token=' + token;
    urlList.push({ sellerId: sellerId, nome: nome + ' ' + cognome, email: email, url: url });

    Logger.log('[URL] ' + nome + ' ' + cognome + ': ' + url);
    generati++;
    Utilities.sleep(300);
  }

  // Log riepilogo nel Logger (nessuna email inviata — i link si inviano manualmente)
  urlList.forEach(function(u) {
    Logger.log(u.sellerId + ' — ' + u.nome + ' — ' + u.url);
  });

  Logger.log('generateSellerDashboardTokens completato: ' + generati + ' venditori aggiornati.');
  SpreadsheetApp.getUi().alert('Token generati: ' + generati + '\nI link sono visibili nel Logger e nel foglio Sellers. Nessuna email inviata.');
}

/**
 * Aggiunge le colonne 'seller_id' e 'seller_name' al foglio Bookings se non esistono.
 * Eseguire UNA SOLA VOLTA dall'editor Apps Script.
 */
function addSellerColumns() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(SHEETS.BOOKINGS);
  const data = sheet.getDataRange().getValues();
  const headers = data[0];

  let added = 0;

  if (headers.indexOf('seller_id') === -1) {
    const col = headers.length + added + 1;
    sheet.getRange(1, col).setValue('seller_id').setFontWeight('bold').setBackground('#D3D3D3');
    Logger.log('Colonna seller_id aggiunta in posizione ' + col);
    added++;
  } else {
    Logger.log('Colonna seller_id già presente.');
  }

  if (headers.indexOf('seller_name') === -1) {
    const col = headers.length + added + 1;
    sheet.getRange(1, col).setValue('seller_name').setFontWeight('bold').setBackground('#D3D3D3');
    Logger.log('Colonna seller_name aggiunta in posizione ' + col);
    added++;
  } else {
    Logger.log('Colonna seller_name già presente.');
  }

  if (added > 0) {
    SpreadsheetApp.getUi().alert('Colonne aggiunte al foglio Bookings: ' + added);
  } else {
    SpreadsheetApp.getUi().alert('Le colonne seller_id e seller_name esistono già.');
  }
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
