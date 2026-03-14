/**
 * Api.gs
 * Handler delle richieste API per WUP Coach Booking.
 */

function handleListCoaches(params) {
  try {
    const coaches = getAllCoaches();
    const safeCoaches = coaches.map(function(c) {
      return {
        id: c.id, nome: c.nome, cognome: c.cognome, email: c.email,
        ruolo: c.ruolo, bio: c.bio, foto_url: c.foto_url,
        working_hours_start: c.working_hours_start,
        working_hours_end: c.working_hours_end,
        slot_duration_min: c.slot_duration_min
        // calendar_managed_id escluso per sicurezza
      };
    });
    return successResponse({ coaches: safeCoaches });
  } catch (err) {
    logAudit(LOG_LEVEL.ERROR, 'LIST_COACHES', '', err.message, {});
    return errorResponse('Impossibile recuperare la lista dei coach.', 'LIST_COACHES_ERROR');
  }
}

function handleGetAvailability(params) {
  try {
    if (!params.coach_id) return errorResponse('Parametro coach_id mancante.', 'MISSING_COACH_ID');
    if (!params.date)     return errorResponse('Parametro date mancante.', 'MISSING_DATE');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(params.date)) {
      return errorResponse('Formato data non valido. Usa YYYY-MM-DD.', 'INVALID_DATE_FORMAT');
    }

    const requestedDate = new Date(params.date + 'T00:00:00');
    const today = new Date(); today.setHours(0,0,0,0);
    if (requestedDate < today) {
      return errorResponse('Data nel passato.', 'DATE_IN_PAST');
    }

    const maxDate = new Date(today);
    maxDate.setDate(maxDate.getDate() + DAYS_AHEAD_MAX);
    if (requestedDate > maxDate) {
      return errorResponse('Data oltre il limite di ' + DAYS_AHEAD_MAX + ' giorni.', 'DATE_TOO_FAR');
    }

    const coach = getCoachById(params.coach_id);
    if (!coach) return errorResponse('Coach non trovato.', 'COACH_NOT_FOUND');

    const slots = getAvailableSlots(coach, params.date);
    return successResponse({ slots: slots, date: params.date, coach_id: params.coach_id });

  } catch (err) {
    logAudit(LOG_LEVEL.ERROR, 'GET_AVAILABILITY', '', err.message, { params: params });
    return errorResponse('Impossibile recuperare la disponibilità.', 'GET_AVAILABILITY_ERROR');
  }
}

function handleGetAvailabilitySummary(params) {
  try {
    if (!params.coach_id)              return errorResponse('coach_id mancante.', 'MISSING_COACH_ID');
    if (!params.from_date || !params.to_date) {
      return errorResponse('from_date e to_date obbligatori.', 'MISSING_DATE_RANGE');
    }

    const fromDate = new Date(params.from_date + 'T12:00:00');
    const toDate   = new Date(params.to_date   + 'T12:00:00');
    const diffDays = Math.round((toDate - fromDate) / 86400000);

    if (diffDays < 0)            return errorResponse('from_date deve precedere to_date.', 'INVALID_DATE_RANGE');
    if (diffDays > DAYS_AHEAD_MAX) return errorResponse('Range max ' + DAYS_AHEAD_MAX + ' giorni.', 'DATE_RANGE_TOO_WIDE');

    const coach = getCoachById(params.coach_id);
    if (!coach) return errorResponse('Coach non trovato.', 'COACH_NOT_FOUND');

    const summary = getAvailabilitySummary(coach, params.from_date, params.to_date);
    return successResponse({ dates: summary });

  } catch (err) {
    logAudit(LOG_LEVEL.ERROR, 'GET_AVAILABILITY_SUMMARY', '', err.message, { params: params });
    return errorResponse('Impossibile recuperare il riepilogo disponibilità.', 'GET_SUMMARY_ERROR');
  }
}

function handleCreateBooking(params) {
  let lock = null;
  try {
    // Validazione input
    if (!params.coach_id)       return errorResponse('coach_id mancante.', 'MISSING_COACH_ID');
    if (!params.start_datetime) return errorResponse('start_datetime mancante.', 'MISSING_START_DATETIME');
    if (!params.client_name || !params.client_name.trim())    return errorResponse('Nome obbligatorio.', 'MISSING_CLIENT_NAME');
    if (!params.client_surname || !params.client_surname.trim()) return errorResponse('Cognome obbligatorio.', 'MISSING_CLIENT_SURNAME');
    if (!validateEmail(params.client_email)) return errorResponse('Email non valida.', 'INVALID_CLIENT_EMAIL');
    if (!params.notes || !params.notes.trim()) return errorResponse('Le note sono obbligatorie.', 'MISSING_NOTES');
    if (!params.privacy_consent) return errorResponse('Accettare la privacy policy è obbligatorio.', 'MISSING_PRIVACY_CONSENT');

    let startDate;
    try { startDate = parseDateTime(params.start_datetime); }
    catch(e) { return errorResponse('Formato start_datetime non valido.', 'INVALID_START_DATETIME'); }

    const coach = getCoachById(params.coach_id);
    if (!coach) return errorResponse('Coach non trovato.', 'COACH_NOT_FOUND');

    const slotMin   = parseInt(coach.slot_duration_min) || SLOT_DURATION_DEFAULT_MIN;
    const endDate   = new Date(startDate.getTime() + slotMin * 60 * 1000);
    const rangeVal  = validateDateRange(startDate, endDate);
    if (!rangeVal.valid) return errorResponse(rangeVal.error, 'INVALID_DATE_RANGE');

    // Controllo limite 2 prenotazioni per email
    const existingConfirmed = getBookingsByStatus(BOOKING_STATUS.CONFIRMED);
    const clientEmailLower = params.client_email.trim().toLowerCase();
    const emailCount = existingConfirmed.filter(function(b) {
      return String(b.client_email).toLowerCase() === clientEmailLower;
    }).length;
    if (emailCount >= 2) {
      return errorResponse('Hai già 2 prenotazioni attive. Non è possibile prenotare più di 2 sessioni con la stessa email.', 'MAX_BOOKINGS_REACHED');
    }

    // Acquisisci lock anti-concorrenza
    lock = acquireLock(LOCK_TIMEOUT_MS);

    // Ricalcolo disponibilità server-side
    const dateStr = Utilities.formatDate(startDate, TIMEZONE, 'yyyy-MM-dd');
    const availableSlots = getAvailableSlots(coach, dateStr);
    const isAvailable = availableSlots.some(function(s) {
      return new Date(s.start).toISOString() === startDate.toISOString();
    });

    if (!isAvailable) {
      releaseLock(lock);
      return errorResponse('Lo slot non è più disponibile. Scegli un altro orario.', 'SLOT_NOT_AVAILABLE');
    }

    const bookingId  = generateId('BK');
    const cancelToken = generateToken();
    const coachFullName = (coach.nome || '') + ' ' + (coach.cognome || '');

    // Resolve seller info if provided
    const sellerId   = sanitizeString(params.seller_id || '');
    const sellerName = sanitizeString(params.seller_name || '');

    const bookingData = {
      booking_id:     bookingId,
      created_at:     formatDatetime(new Date()),
      coach_id:       coach.id,
      coach_name:     coachFullName.trim(),
      coach_email:    coach.email,
      client_name:    sanitizeString(params.client_name),
      client_surname: sanitizeString(params.client_surname),
      client_email:   params.client_email.trim().toLowerCase(),
      client_phone:   sanitizeString(params.client_phone || ''),
      start_datetime: startDate.toISOString(),
      end_datetime:   endDate.toISOString(),
      timezone:       TIMEZONE,
      notes:          sanitizeString(params.notes || ''),
      status:         BOOKING_STATUS.CONFIRMED,
      cancel_token:   cancelToken,
      event_id:       '',
      calendar_id:    '',
      seller_id:      sellerId,
      seller_name:    sellerName
    };

    // Crea evento calendario
    try {
      const calResult = createCalendarEvent(coach, bookingData);
      bookingData.event_id   = calResult.eventId;
      bookingData.calendar_id = calResult.calendarId;
    } catch (calErr) {
      logAudit(LOG_LEVEL.WARN, 'CREATE_BOOKING', bookingId,
        'Evento calendario non creato: ' + calErr.message, {});
    }

    createBooking(bookingData);

    logAudit(LOG_LEVEL.INFO, 'CREATE_BOOKING', bookingId,
      'Prenotazione creata', { coachId: coach.id, clientEmail: bookingData.client_email });

    releaseLock(lock);
    lock = null;

    sendBookingConfirmationToClient(bookingData, coach);
    sendBookingNotificationToCoach(bookingData, coach);

    // Send confirmation to seller if present
    if (sellerId) {
      try {
        const seller = getSellerById(sellerId);
        if (seller && seller.email) {
          const clientFullName = bookingData.client_name + ' ' + bookingData.client_surname;
          sendSellerConfirmation(
            seller.email,
            (seller.nome || '') + ' ' + (seller.cognome || ''),
            coachFullName.trim(),
            clientFullName,
            startDate,
            endDate,
            bookingId
          );
        }
      } catch (sellerErr) {
        logAudit(LOG_LEVEL.WARN, 'CREATE_BOOKING', bookingId,
          'Email venditore non inviata: ' + sellerErr.message, {});
      }
    }

    return successResponse({
      booking_id: bookingId,
      message: 'Prenotazione confermata. Controlla la tua email.'
    });

  } catch (err) {
    if (lock) releaseLock(lock);
    logAudit(LOG_LEVEL.ERROR, 'CREATE_BOOKING', '', err.message, {});
    if (err.message && err.message.includes('lock')) {
      return errorResponse('Sistema occupato. Riprova tra qualche secondo.', 'LOCK_TIMEOUT');
    }
    return errorResponse('Errore durante la prenotazione. Riprova.', 'CREATE_BOOKING_ERROR');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DASHBOARD HANDLERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET ?action=getAdminBookings&admin_token=TOKEN[&date=YYYY-MM-DD][&coach_id=X]
 * Restituisce tutte le prenotazioni con statistiche aggregate.
 * Esclude campi sensibili: cancel_token, event_id, calendar_id.
 */
function handleGetAdminBookings(params) {
  try {
    if (!params.admin_token || params.admin_token !== DASHBOARD_ADMIN_TOKEN) {
      return errorResponse('Non autorizzato.', 'UNAUTHORIZED');
    }

    const allConfirmed  = getBookingsByStatus(BOOKING_STATUS.CONFIRMED);
    const allCancelled  = getBookingsByStatus(BOOKING_STATUS.CANCELLED);
    const allBookings   = allConfirmed.concat(allCancelled);

    // Filtro opzionale per data
    let filtered = allBookings;
    if (params.date) {
      filtered = filtered.filter(function(b) {
        return String(b.start_datetime || '').indexOf(params.date) === 0 ||
               String(b.start_datetime || '').indexOf(params.date) !== -1 &&
               _isoDatePart(b.start_datetime) === params.date;
      });
    }
    // Filtro opzionale per coach
    if (params.coach_id) {
      filtered = filtered.filter(function(b) {
        return String(b.coach_id) === String(params.coach_id);
      });
    }

    const safe = filtered.map(_safeDashboardBooking);

    // Stats globali (sui dati non filtrati per coach/data)
    const confirmedCount = allConfirmed.length;
    const cancelledCount = allCancelled.length;

    // Stats per giorno evento
    const dayStats = {};
    ['2026-03-13','2026-03-14','2026-03-15'].forEach(function(d) {
      dayStats[d] = allConfirmed.filter(function(b) {
        return _isoDatePart(b.start_datetime) === d;
      }).length;
    });

    return successResponse({
      bookings: safe,
      meta: {
        total:     confirmedCount + cancelledCount,
        confirmed: confirmedCount,
        cancelled: cancelledCount,
        per_day:   dayStats
      }
    });

  } catch (err) {
    logAudit(LOG_LEVEL.ERROR, 'GET_ADMIN_BOOKINGS', '', err.message, {});
    return errorResponse('Errore nel recupero delle prenotazioni.', 'GET_ADMIN_BOOKINGS_ERROR');
  }
}

/**
 * GET ?action=getCoachBookings&coach_id=X&coach_token=TOKEN[&date=YYYY-MM-DD]
 * Restituisce le prenotazioni del coach (read-only).
 * Esclude: client_email, cancel_token, event_id, calendar_id.
 */
function handleGetCoachBookings(params) {
  try {
    if (!params.coach_id)    return errorResponse('coach_id mancante.', 'MISSING_COACH_ID');
    if (!params.coach_token) return errorResponse('coach_token mancante.', 'MISSING_COACH_TOKEN');

    const coach = getCoachById(params.coach_id);
    if (!coach) return errorResponse('Coach non trovato.', 'COACH_NOT_FOUND');

    if (!coach.dashboard_token || String(coach.dashboard_token) !== String(params.coach_token)) {
      return errorResponse('Non autorizzato.', 'UNAUTHORIZED');
    }

    const allConfirmed = getBookingsByStatus(BOOKING_STATUS.CONFIRMED);
    let bookings = allConfirmed.filter(function(b) {
      return String(b.coach_id) === String(params.coach_id);
    });

    if (params.date) {
      bookings = bookings.filter(function(b) {
        return _isoDatePart(b.start_datetime) === params.date;
      });
    }

    // Ordina per start_datetime
    bookings.sort(function(a, b) {
      return new Date(a.start_datetime) - new Date(b.start_datetime);
    });

    const safe = bookings.map(function(b) {
      return {
        booking_id:     String(b.booking_id),
        coach_id:       String(b.coach_id),
        coach_name:     String(b.coach_name),
        client_name:    String(b.client_name),
        client_surname: String(b.client_surname),
        client_phone:   String(b.client_phone || ''),
        start_datetime: String(b.start_datetime),
        end_datetime:   String(b.end_datetime),
        notes:          String(b.notes || ''),
        status:         String(b.status),
        salesforce_opportunity: String(b.salesforce_opportunity || ''),
        seller_id:      String(b.seller_id || ''),
        seller_name:    String(b.seller_name || '')
        // Esclusi: client_email, cancel_token, event_id, calendar_id
      };
    });

    return successResponse({
      bookings: safe,
      coach: {
        id:      String(coach.id),
        nome:    String(coach.nome),
        cognome: String(coach.cognome),
        ruolo:   String(coach.ruolo || '')
      },
      total: safe.length
    });

  } catch (err) {
    logAudit(LOG_LEVEL.ERROR, 'GET_COACH_BOOKINGS', '', err.message, {});
    return errorResponse('Errore nel recupero delle prenotazioni.', 'GET_COACH_BOOKINGS_ERROR');
  }
}

/**
 * POST { action: 'adminCancelBooking', admin_token, booking_id }
 * Cancella una prenotazione con audit actor='admin'.
 */
function handleAdminCancelBooking(params) {
  try {
    if (!params.admin_token || params.admin_token !== DASHBOARD_ADMIN_TOKEN) {
      return errorResponse('Non autorizzato.', 'UNAUTHORIZED');
    }
    if (!params.booking_id) return errorResponse('booking_id mancante.', 'MISSING_BOOKING_ID');

    const booking = getBookingById(params.booking_id);
    if (!booking) return errorResponse('Prenotazione non trovata.', 'BOOKING_NOT_FOUND');

    if (String(booking.status) === BOOKING_STATUS.CANCELLED) {
      return errorResponse('Prenotazione già cancellata.', 'ALREADY_CANCELLED');
    }

    const coach = getCoachById(String(booking.coach_id));

    const calendarId = String(booking.calendar_id || '');
    const eventId    = String(booking.event_id    || '');
    if (calendarId && eventId) {
      try { cancelCalendarEvent(calendarId, eventId); } catch(e) {}
    }

    updateBookingStatus(String(booking.booking_id), BOOKING_STATUS.CANCELLED);

    logAudit(LOG_LEVEL.INFO, 'ADMIN_CANCEL_BOOKING', String(booking.booking_id),
      'Cancellazione admin dalla dashboard', { actor: 'admin', clientEmail: booking.client_email });

    if (coach) {
      try { sendCancellationToClient(booking, coach); } catch(e) {}
      try { sendCancellationToCoach(booking, coach);  } catch(e) {}
    }

    // Notify seller if booking has a seller_id
    if (booking.seller_id) {
      try {
        const seller = getSellerById(String(booking.seller_id));
        if (seller && seller.email) {
          sendSellerCancellation(seller, booking, coach);
        }
      } catch(e) {}
    }

    return successResponse({
      message: 'Prenotazione cancellata.',
      booking_id: String(booking.booking_id)
    });

  } catch (err) {
    logAudit(LOG_LEVEL.ERROR, 'ADMIN_CANCEL_BOOKING', '', err.message, {});
    return errorResponse('Errore durante la cancellazione.', 'ADMIN_CANCEL_ERROR');
  }
}

// Helper: estrae la parte data da un ISO datetime
function _isoDatePart(isoStr) {
  if (!isoStr) return '';
  return String(isoStr).substring(0, 10);
}

/**
 * GET ?action=getCoachLinks&admin_token=TOKEN
 * Restituisce tutti i coach attivi con il loro URL dashboard personale.
 */
function handleGetCoachLinks(params) {
  try {
    if (!params.admin_token || params.admin_token !== DASHBOARD_ADMIN_TOKEN) {
      return errorResponse('Non autorizzato.', 'UNAUTHORIZED');
    }

    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(SHEETS.COACHES);
    const data = sheet.getDataRange().getValues();
    const headers = data[0];

    const colId      = headers.indexOf('id');
    const colNome    = headers.indexOf('nome');
    const colCognome = headers.indexOf('cognome');
    const colRuolo   = headers.indexOf('ruolo');
    const colEmail   = headers.indexOf('email');
    const colActive  = headers.indexOf('active');
    const colToken   = headers.indexOf('dashboard_token');

    const BASE = 'https://wup-platform.github.io/wup-coach-dashboard/coach.html';
    const coaches = [];

    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      if (String(row[colActive]).toUpperCase() !== 'TRUE') continue;
      const token = String(row[colToken] || '');
      const id    = String(row[colId]);
      coaches.push({
        id:      id,
        nome:    String(row[colNome]),
        cognome: String(row[colCognome]),
        ruolo:   String(row[colRuolo] || ''),
        email:   String(row[colEmail] || ''),
        url:     token ? BASE + '?id=' + encodeURIComponent(id) + '&token=' + token : ''
      });
    }

    return successResponse({ coaches: coaches });
  } catch(err) {
    logAudit(LOG_LEVEL.ERROR, 'GET_COACH_LINKS', '', err.message, {});
    return errorResponse('Errore nel recupero dei link.', 'GET_COACH_LINKS_ERROR');
  }
}

/**
 * GET ?action=getSellerLinks&admin_token=TOKEN
 * Restituisce tutti i venditori attivi con il loro URL dashboard personale.
 */
function handleGetSellerLinks(params) {
  try {
    if (!params.admin_token || params.admin_token !== DASHBOARD_ADMIN_TOKEN) {
      return errorResponse('Non autorizzato.', 'UNAUTHORIZED');
    }

    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName(SHEETS.SELLERS);
    if (!sheet) return successResponse({ sellers: [] });
    const data = sheet.getDataRange().getValues();
    const headers = data[0];

    const colId      = headers.indexOf('id');
    const colNome    = headers.indexOf('nome');
    const colCognome = headers.indexOf('cognome');
    const colEmail   = headers.indexOf('email');
    const colActive  = headers.indexOf('active');
    const colToken   = headers.indexOf('dashboard_token');

    const BASE = 'https://wup-platform.github.io/wup-coach-dashboard/seller.html';
    const sellers = [];

    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      if (String(row[colActive]).toUpperCase() !== 'TRUE') continue;
      const token = String(row[colToken] || '');
      const id    = String(row[colId]);
      sellers.push({
        id:      id,
        nome:    String(row[colNome]),
        cognome: String(row[colCognome]),
        email:   String(row[colEmail] || ''),
        url:     token ? BASE + '?id=' + encodeURIComponent(id) + '&token=' + token : ''
      });
    }

    return successResponse({ sellers: sellers });
  } catch(err) {
    logAudit(LOG_LEVEL.ERROR, 'GET_SELLER_LINKS', '', err.message, {});
    return errorResponse('Errore nel recupero dei link venditori.', 'GET_SELLER_LINKS_ERROR');
  }
}

/**
 * POST { action: 'updateBookingOutcome', admin_token, booking_id, esito }
 * Aggiorna l'esito commerciale di una prenotazione (VENDUTO / NON_VENDUTO / IN_TRATTATIVA).
 * Crea la colonna 'esito' nel foglio Bookings se non esiste.
 */
function handleUpdateBookingOutcome(params) {
  try {
    if (!params.admin_token || params.admin_token !== DASHBOARD_ADMIN_TOKEN) {
      return errorResponse('Non autorizzato.', 'UNAUTHORIZED');
    }
    if (!params.booking_id) return errorResponse('booking_id mancante.', 'MISSING_BOOKING_ID');

    const VALID = ['VENDUTO', 'NON_VENDUTO', 'IN_TRATTATIVA', 'NON_PRESENTATO', ''];
    if (VALID.indexOf(params.esito || '') === -1) {
      return errorResponse('Esito non valido.', 'INVALID_ESITO');
    }

    const sheet = getSheet(SHEETS.BOOKINGS);
    const data  = sheet.getDataRange().getValues();
    const headers = data[0];
    const idIdx   = headers.indexOf('booking_id');

    // Aggiungi colonna esito se non esiste
    let esitoIdx = headers.indexOf('esito');
    if (esitoIdx === -1) {
      esitoIdx = headers.length;
      sheet.getRange(1, esitoIdx + 1).setValue('esito').setFontWeight('bold').setBackground('#D3D3D3');
    }

    for (let i = 1; i < data.length; i++) {
      if (String(data[i][idIdx]) === String(params.booking_id)) {
        sheet.getRange(i + 1, esitoIdx + 1).setValue(params.esito || '');
        logAudit(LOG_LEVEL.INFO, 'UPDATE_OUTCOME', params.booking_id,
          'Esito: ' + (params.esito || 'reset'), { actor: 'admin' });
        return successResponse({ message: 'Esito salvato.', booking_id: params.booking_id });
      }
    }

    return errorResponse('Prenotazione non trovata.', 'BOOKING_NOT_FOUND');
  } catch(err) {
    logAudit(LOG_LEVEL.ERROR, 'UPDATE_OUTCOME', '', err.message, {});
    return errorResponse('Errore aggiornamento esito.', 'UPDATE_OUTCOME_ERROR');
  }
}

/**
 * POST { action: 'updateSalesforceFlag', admin_token|coach_token, booking_id, salesforce_opportunity }
 * Aggiorna il flag "Opportunità su Salesforce creata" per una prenotazione.
 * Accesso consentito sia all'admin sia al coach (con coach_token).
 */
function handleUpdateSalesforceFlag(params) {
  try {
    // Auth: admin_token oppure coach_token valido
    const isAdmin = params.admin_token && params.admin_token === DASHBOARD_ADMIN_TOKEN;
    let isCoach = false;
    if (!isAdmin && params.coach_id && params.coach_token) {
      const coach = getCoachById(params.coach_id);
      if (coach && coach.dashboard_token && String(coach.dashboard_token) === String(params.coach_token)) {
        isCoach = true;
      }
    }
    if (!isAdmin && !isCoach) {
      return errorResponse('Non autorizzato.', 'UNAUTHORIZED');
    }
    if (!params.booking_id) return errorResponse('booking_id mancante.', 'MISSING_BOOKING_ID');

    const flagValue = params.salesforce_opportunity === true || params.salesforce_opportunity === 'true' || params.salesforce_opportunity === 'TRUE';

    const sheet = getSheet(SHEETS.BOOKINGS);
    const data  = sheet.getDataRange().getValues();
    const headers = data[0];
    const idIdx   = headers.indexOf('booking_id');

    // Aggiungi colonna salesforce_opportunity se non esiste
    let sfIdx = headers.indexOf('salesforce_opportunity');
    if (sfIdx === -1) {
      sfIdx = headers.length;
      sheet.getRange(1, sfIdx + 1).setValue('salesforce_opportunity').setFontWeight('bold').setBackground('#D3D3D3');
    }

    for (let i = 1; i < data.length; i++) {
      if (String(data[i][idIdx]) === String(params.booking_id)) {
        sheet.getRange(i + 1, sfIdx + 1).setValue(flagValue ? 'TRUE' : 'FALSE');
        logAudit(LOG_LEVEL.INFO, 'UPDATE_SF_FLAG', params.booking_id,
          'Salesforce opportunity: ' + (flagValue ? 'TRUE' : 'FALSE'), { actor: isAdmin ? 'admin' : 'coach' });
        return successResponse({ message: 'Flag Salesforce aggiornato.', booking_id: params.booking_id });
      }
    }

    return errorResponse('Prenotazione non trovata.', 'BOOKING_NOT_FOUND');
  } catch(err) {
    logAudit(LOG_LEVEL.ERROR, 'UPDATE_SF_FLAG', '', err.message, {});
    return errorResponse('Errore aggiornamento flag Salesforce.', 'UPDATE_SF_FLAG_ERROR');
  }
}

/**
 * POST { action: 'updateBookingNotes', admin_token, booking_id, notes }
 * Aggiorna le note di una prenotazione dalla dashboard admin.
 */
function handleUpdateBookingNotes(params) {
  try {
    if (!params.admin_token || params.admin_token !== DASHBOARD_ADMIN_TOKEN) {
      return errorResponse('Non autorizzato.', 'UNAUTHORIZED');
    }
    if (!params.booking_id) return errorResponse('booking_id mancante.', 'MISSING_BOOKING_ID');

    const newNotes = sanitizeString(params.notes || '');

    const sheet = getSheet(SHEETS.BOOKINGS);
    const data  = sheet.getDataRange().getValues();
    const headers = data[0];
    const idIdx    = headers.indexOf('booking_id');
    const notesIdx = headers.indexOf('notes');

    if (notesIdx === -1) {
      return errorResponse('Colonna notes non trovata.', 'NOTES_COLUMN_MISSING');
    }

    for (let i = 1; i < data.length; i++) {
      if (String(data[i][idIdx]) === String(params.booking_id)) {
        sheet.getRange(i + 1, notesIdx + 1).setValue(newNotes);
        logAudit(LOG_LEVEL.INFO, 'UPDATE_NOTES', params.booking_id,
          'Note aggiornate da admin', { actor: 'admin' });
        return successResponse({ message: 'Note salvate.', booking_id: params.booking_id });
      }
    }

    return errorResponse('Prenotazione non trovata.', 'BOOKING_NOT_FOUND');
  } catch(err) {
    logAudit(LOG_LEVEL.ERROR, 'UPDATE_NOTES', '', err.message, {});
    return errorResponse('Errore aggiornamento note.', 'UPDATE_NOTES_ERROR');
  }
}

// Helper: booking anonimizzato per la dashboard admin
function _safeDashboardBooking(b) {
  return {
    booking_id:     String(b.booking_id),
    created_at:     String(b.created_at || ''),
    coach_id:       String(b.coach_id),
    coach_name:     String(b.coach_name),
    client_name:    String(b.client_name),
    client_surname: String(b.client_surname),
    client_email:   String(b.client_email || ''),
    client_phone:   String(b.client_phone || ''),
    start_datetime: String(b.start_datetime),
    end_datetime:   String(b.end_datetime),
    notes:          String(b.notes || ''),
    status:         String(b.status),
    cancelled_at:   String(b.cancelled_at || ''),
    esito:          String(b.esito || ''),
    salesforce_opportunity: String(b.salesforce_opportunity || ''),
    seller_id:      String(b.seller_id || ''),
    seller_name:    String(b.seller_name || '')
    // Esclusi: cancel_token, event_id, calendar_id
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// SELLER HANDLERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET/POST action=get_sellers
 * Returns list of active sellers (id, nome, cognome). No auth required.
 */
function handleGetSellers(params) {
  try {
    const sellers = getAllSellers();
    const safeSellers = sellers.map(function(s) {
      return { id: s.id, nome: s.nome, cognome: s.cognome };
    });
    return successResponse({ sellers: safeSellers });
  } catch (err) {
    logAudit(LOG_LEVEL.ERROR, 'GET_SELLERS', '', err.message, {});
    return errorResponse('Impossibile recuperare la lista dei venditori.', 'GET_SELLERS_ERROR');
  }
}

/**
 * GET/POST action=seller_auth — validates seller_id + seller_token, returns seller info.
 */
function handleSellerAuth(params) {
  try {
    if (!params.seller_id)    return errorResponse('seller_id mancante.', 'MISSING_SELLER_ID');
    if (!params.seller_token) return errorResponse('seller_token mancante.', 'MISSING_SELLER_TOKEN');

    const seller = getSellerById(params.seller_id);
    if (!seller) return errorResponse('Venditore non trovato.', 'SELLER_NOT_FOUND');

    if (!seller.dashboard_token || String(seller.dashboard_token) !== String(params.seller_token)) {
      return errorResponse('Non autorizzato.', 'UNAUTHORIZED');
    }

    return successResponse({
      seller: {
        id:      String(seller.id),
        nome:    String(seller.nome),
        cognome: String(seller.cognome),
        email:   String(seller.email)
      }
    });
  } catch (err) {
    logAudit(LOG_LEVEL.ERROR, 'SELLER_AUTH', '', err.message, {});
    return errorResponse('Errore autenticazione venditore.', 'SELLER_AUTH_ERROR');
  }
}

/**
 * GET/POST action=seller_bookings — requires seller_id + seller_token.
 * Returns all bookings where seller_id matches.
 */
function handleSellerBookings(params) {
  try {
    if (!params.seller_id)    return errorResponse('seller_id mancante.', 'MISSING_SELLER_ID');
    if (!params.seller_token) return errorResponse('seller_token mancante.', 'MISSING_SELLER_TOKEN');

    const seller = getSellerById(params.seller_id);
    if (!seller) return errorResponse('Venditore non trovato.', 'SELLER_NOT_FOUND');

    if (!seller.dashboard_token || String(seller.dashboard_token) !== String(params.seller_token)) {
      return errorResponse('Non autorizzato.', 'UNAUTHORIZED');
    }

    const allConfirmed = getBookingsByStatus(BOOKING_STATUS.CONFIRMED);
    const allCancelled = getBookingsByStatus(BOOKING_STATUS.CANCELLED);
    const allBookings  = allConfirmed.concat(allCancelled);

    let bookings = allBookings.filter(function(b) {
      return String(b.seller_id) === String(params.seller_id);
    });

    if (params.date) {
      bookings = bookings.filter(function(b) {
        return _isoDatePart(b.start_datetime) === params.date;
      });
    }

    // Sort by start_datetime
    bookings.sort(function(a, b) {
      return new Date(a.start_datetime) - new Date(b.start_datetime);
    });

    const safe = bookings.map(function(b) {
      return {
        booking_id:     String(b.booking_id),
        coach_id:       String(b.coach_id),
        coach_name:     String(b.coach_name),
        client_name:    String(b.client_name),
        client_surname: String(b.client_surname),
        client_email:   String(b.client_email || ''),
        client_phone:   String(b.client_phone || ''),
        start_datetime: String(b.start_datetime),
        end_datetime:   String(b.end_datetime),
        notes:          String(b.notes || ''),
        status:         String(b.status),
        cancel_token:   String(b.cancel_token || ''),
        esito:          String(b.esito || ''),
        salesforce_opportunity: String(b.salesforce_opportunity || ''),
        seller_id:      String(b.seller_id || ''),
        seller_name:    String(b.seller_name || '')
      };
    });

    return successResponse({
      bookings: safe,
      seller: {
        id:      String(seller.id),
        nome:    String(seller.nome),
        cognome: String(seller.cognome)
      },
      total: safe.length
    });

  } catch (err) {
    logAudit(LOG_LEVEL.ERROR, 'SELLER_BOOKINGS', '', err.message, {});
    return errorResponse('Errore nel recupero delle prenotazioni.', 'SELLER_BOOKINGS_ERROR');
  }
}

/**
 * POST action=seller_update_esito — updates esito only if booking belongs to seller.
 */
function handleSellerUpdateEsito(params) {
  try {
    if (!params.seller_id)    return errorResponse('seller_id mancante.', 'MISSING_SELLER_ID');
    if (!params.seller_token) return errorResponse('seller_token mancante.', 'MISSING_SELLER_TOKEN');
    if (!params.booking_id)   return errorResponse('booking_id mancante.', 'MISSING_BOOKING_ID');

    const seller = getSellerById(params.seller_id);
    if (!seller) return errorResponse('Venditore non trovato.', 'SELLER_NOT_FOUND');
    if (!seller.dashboard_token || String(seller.dashboard_token) !== String(params.seller_token)) {
      return errorResponse('Non autorizzato.', 'UNAUTHORIZED');
    }

    const VALID = ['VENDUTO', 'NON_VENDUTO', 'IN_TRATTATIVA', 'NON_PRESENTATO', ''];
    if (VALID.indexOf(params.esito || '') === -1) {
      return errorResponse('Esito non valido.', 'INVALID_ESITO');
    }

    const sheet   = getSheet(SHEETS.BOOKINGS);
    const data    = sheet.getDataRange().getValues();
    const headers = data[0];
    const idIdx       = headers.indexOf('booking_id');
    const sellerIdx   = headers.indexOf('seller_id');

    // Ensure esito column exists
    let esitoIdx = headers.indexOf('esito');
    if (esitoIdx === -1) {
      esitoIdx = headers.length;
      sheet.getRange(1, esitoIdx + 1).setValue('esito').setFontWeight('bold').setBackground('#D3D3D3');
    }

    for (let i = 1; i < data.length; i++) {
      if (String(data[i][idIdx]) === String(params.booking_id)) {
        // Check ownership
        if (sellerIdx === -1 || String(data[i][sellerIdx]) !== String(params.seller_id)) {
          return errorResponse('Questa prenotazione non appartiene a te.', 'NOT_YOUR_BOOKING');
        }
        sheet.getRange(i + 1, esitoIdx + 1).setValue(params.esito || '');
        logAudit(LOG_LEVEL.INFO, 'SELLER_UPDATE_ESITO', params.booking_id,
          'Esito: ' + (params.esito || 'reset'), { actor: 'seller', sellerId: params.seller_id });
        return successResponse({ message: 'Esito salvato.', booking_id: params.booking_id });
      }
    }

    return errorResponse('Prenotazione non trovata.', 'BOOKING_NOT_FOUND');
  } catch (err) {
    logAudit(LOG_LEVEL.ERROR, 'SELLER_UPDATE_ESITO', '', err.message, {});
    return errorResponse('Errore aggiornamento esito.', 'SELLER_UPDATE_ESITO_ERROR');
  }
}

/**
 * POST action=seller_update_salesforce — updates salesforce flag only if booking belongs to seller.
 */
function handleSellerUpdateSalesforce(params) {
  try {
    if (!params.seller_id)    return errorResponse('seller_id mancante.', 'MISSING_SELLER_ID');
    if (!params.seller_token) return errorResponse('seller_token mancante.', 'MISSING_SELLER_TOKEN');
    if (!params.booking_id)   return errorResponse('booking_id mancante.', 'MISSING_BOOKING_ID');

    const seller = getSellerById(params.seller_id);
    if (!seller) return errorResponse('Venditore non trovato.', 'SELLER_NOT_FOUND');
    if (!seller.dashboard_token || String(seller.dashboard_token) !== String(params.seller_token)) {
      return errorResponse('Non autorizzato.', 'UNAUTHORIZED');
    }

    const flagValue = params.salesforce === true || params.salesforce === 'true' || params.salesforce === 'TRUE';

    const sheet   = getSheet(SHEETS.BOOKINGS);
    const data    = sheet.getDataRange().getValues();
    const headers = data[0];
    const idIdx       = headers.indexOf('booking_id');
    const sellerIdx   = headers.indexOf('seller_id');

    // Ensure salesforce_opportunity column exists
    let sfIdx = headers.indexOf('salesforce_opportunity');
    if (sfIdx === -1) {
      sfIdx = headers.length;
      sheet.getRange(1, sfIdx + 1).setValue('salesforce_opportunity').setFontWeight('bold').setBackground('#D3D3D3');
    }

    for (let i = 1; i < data.length; i++) {
      if (String(data[i][idIdx]) === String(params.booking_id)) {
        // Check ownership
        if (sellerIdx === -1 || String(data[i][sellerIdx]) !== String(params.seller_id)) {
          return errorResponse('Questa prenotazione non appartiene a te.', 'NOT_YOUR_BOOKING');
        }
        sheet.getRange(i + 1, sfIdx + 1).setValue(flagValue ? 'TRUE' : 'FALSE');
        logAudit(LOG_LEVEL.INFO, 'SELLER_UPDATE_SF', params.booking_id,
          'Salesforce opportunity: ' + (flagValue ? 'TRUE' : 'FALSE'), { actor: 'seller', sellerId: params.seller_id });
        return successResponse({ message: 'Flag Salesforce aggiornato.', booking_id: params.booking_id });
      }
    }

    return errorResponse('Prenotazione non trovata.', 'BOOKING_NOT_FOUND');
  } catch (err) {
    logAudit(LOG_LEVEL.ERROR, 'SELLER_UPDATE_SF', '', err.message, {});
    return errorResponse('Errore aggiornamento flag Salesforce.', 'SELLER_UPDATE_SF_ERROR');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// COACH SLOTS & BLOCK HANDLERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GET ?action=getCoachSlots&admin_token=TOKEN&coach_id=X&date=YYYY-MM-DD
 * Restituisce TUTTI gli slot di un coach per una data, con stato: available, blocked, booked.
 */
function handleGetCoachSlots(params) {
  try {
    if (!params.admin_token || params.admin_token !== DASHBOARD_ADMIN_TOKEN) {
      return errorResponse('Non autorizzato.', 'UNAUTHORIZED');
    }
    if (!params.coach_id) return errorResponse('coach_id mancante.', 'MISSING_COACH_ID');
    if (!params.date)     return errorResponse('date mancante.', 'MISSING_DATE');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(params.date)) {
      return errorResponse('Formato data non valido. Usa YYYY-MM-DD.', 'INVALID_DATE_FORMAT');
    }

    const coach = getCoachById(params.coach_id);
    if (!coach) return errorResponse('Coach non trovato.', 'COACH_NOT_FOUND');

    const dateStr = params.date;
    const parts = dateStr.split('-');
    const year  = parseInt(parts[0]);
    const month = parseInt(parts[1]) - 1;
    const day   = parseInt(parts[2]);

    const startParts = String(coach.working_hours_start || '').split(':');
    const startHour  = parseInt(startParts[0]) || BOOKING_WINDOW_START_HOUR;
    const startMin   = parseInt(startParts[1]) || 0;
    const endParts   = String(coach.working_hours_end || '').split(':');
    const endHour    = parseInt(endParts[0]) || BOOKING_WINDOW_END_HOUR;
    const endMin     = parseInt(endParts[1]) || 0;
    const slotMin    = parseInt(coach.slot_duration_min) || SLOT_DURATION_DEFAULT_MIN;

    const calendar = CalendarApp.getCalendarById(coach.calendar_managed_id);
    if (!calendar) return errorResponse('Calendario non trovato per il coach.', 'CALENDAR_NOT_FOUND');

    const dayStart = new Date(year, month, day, startHour, startMin, 0);
    const dayEnd   = new Date(year, month, day, endHour, endMin, 0);

    const existingEvents = calendar.getEvents(dayStart, dayEnd);

    var slots = [];
    var slotStart = new Date(dayStart);

    while (true) {
      var slotEnd = new Date(slotStart.getTime() + slotMin * 60 * 1000);
      if (slotEnd > dayEnd) break;

      var slotInfo = { start: slotStart.toISOString(), end: slotEnd.toISOString(), status: 'available' };

      // Controlla se c'è un evento sovrapposto
      for (var i = 0; i < existingEvents.length; i++) {
        var eStart = existingEvents[i].getStartTime();
        var eEnd   = existingEvents[i].getEndTime();
        if (slotStart < eEnd && slotEnd > eStart) {
          var title = existingEvents[i].getTitle() || '';
          if (title === 'NON DISPONIBILE') {
            slotInfo.status   = 'blocked';
            slotInfo.event_id = existingEvents[i].getId();
          } else {
            slotInfo.status = 'booked';
            // Estrai client_name dal formato "Wake Up Call – ClientName con CoachName"
            var match = title.match(/^Wake Up Call\s*[–\-]\s*(.+?)\s+con\s+/);
            slotInfo.client_name = match ? match[1].trim() : title;
          }
          break;
        }
      }

      slots.push(slotInfo);
      slotStart = new Date(slotEnd.getTime() + SLOT_BREAK_MIN * 60 * 1000);
    }

    return successResponse({
      slots: slots,
      coach: {
        id:      String(coach.id),
        nome:    String(coach.nome),
        cognome: String(coach.cognome)
      }
    });

  } catch (err) {
    logAudit(LOG_LEVEL.ERROR, 'GET_COACH_SLOTS', '', err.message, { params: params });
    return errorResponse('Errore nel recupero degli slot.', 'GET_COACH_SLOTS_ERROR');
  }
}

/**
 * POST { action: "toggleSlotBlock", admin_token, coach_id, slot_start (ISO), slot_end (ISO), block: true/false }
 * Crea o rimuove un blocco "NON DISPONIBILE" su uno slot del coach.
 * Se il blocco copre più slot, lo splitta rimuovendo solo lo slot richiesto.
 */
function handleToggleSlotBlock(params) {
  try {
    if (!params.admin_token || params.admin_token !== DASHBOARD_ADMIN_TOKEN) {
      return errorResponse('Non autorizzato.', 'UNAUTHORIZED');
    }
    if (!params.coach_id)   return errorResponse('coach_id mancante.', 'MISSING_COACH_ID');
    if (!params.slot_start) return errorResponse('slot_start mancante.', 'MISSING_SLOT_START');
    if (!params.slot_end)   return errorResponse('slot_end mancante.', 'MISSING_SLOT_END');

    const coach = getCoachById(params.coach_id);
    if (!coach) return errorResponse('Coach non trovato.', 'COACH_NOT_FOUND');

    const calendar = CalendarApp.getCalendarById(coach.calendar_managed_id);
    if (!calendar) return errorResponse('Calendario non trovato per il coach.', 'CALENDAR_NOT_FOUND');

    const slotStart = new Date(params.slot_start);
    const slotEnd   = new Date(params.slot_end);
    const shouldBlock = params.block === true || params.block === 'true';

    if (shouldBlock) {
      // Crea evento "NON DISPONIBILE"
      calendar.createEvent('NON DISPONIBILE', slotStart, slotEnd, {
        description: 'Blocco manuale dalla dashboard admin',
        sendInvites: false
      });

      logAudit(LOG_LEVEL.INFO, 'TOGGLE_SLOT_BLOCK', '', 'Slot bloccato', {
        actor: 'admin', coachId: coach.id, slotStart: params.slot_start, slotEnd: params.slot_end
      });

      return successResponse({ message: 'Slot bloccato.', action: 'blocked' });

    } else {
      // Trova e rimuovi il blocco "NON DISPONIBILE" che copre questo slot
      var events = calendar.getEvents(slotStart, slotEnd);
      var blockEvent = null;

      for (var i = 0; i < events.length; i++) {
        if (events[i].getTitle() === 'NON DISPONIBILE') {
          blockEvent = events[i];
          break;
        }
      }

      if (!blockEvent) {
        return errorResponse('Nessun blocco trovato per questo slot.', 'BLOCK_NOT_FOUND');
      }

      var blockStart = blockEvent.getStartTime();
      var blockEnd   = blockEvent.getEndTime();

      // Elimina l'evento blocco
      blockEvent.deleteEvent();

      // Se il blocco è più grande dello slot, ricrea i pezzi rimanenti
      var slotMin  = parseInt(coach.slot_duration_min) || SLOT_DURATION_DEFAULT_MIN;
      var stepMs   = (slotMin + SLOT_BREAK_MIN) * 60 * 1000;
      var slotMs   = slotMin * 60 * 1000;

      if (blockStart.getTime() < slotStart.getTime()) {
        // Ricrea blocchi prima dello slot rimosso
        var cursor = new Date(blockStart.getTime());
        while (cursor.getTime() < slotStart.getTime()) {
          var cursorEnd = new Date(cursor.getTime() + slotMs);
          if (cursorEnd.getTime() <= slotStart.getTime()) {
            calendar.createEvent('NON DISPONIBILE', cursor, cursorEnd, {
              description: 'Blocco manuale (split dalla dashboard admin)',
              sendInvites: false
            });
          }
          cursor = new Date(cursor.getTime() + stepMs);
        }
      }

      if (blockEnd.getTime() > slotEnd.getTime()) {
        // Ricrea blocchi dopo lo slot rimosso
        var cursor = new Date(slotEnd.getTime() + SLOT_BREAK_MIN * 60 * 1000);
        while (cursor.getTime() < blockEnd.getTime()) {
          var cursorEnd = new Date(cursor.getTime() + slotMs);
          if (cursorEnd.getTime() <= blockEnd.getTime()) {
            calendar.createEvent('NON DISPONIBILE', cursor, cursorEnd, {
              description: 'Blocco manuale (split dalla dashboard admin)',
              sendInvites: false
            });
          }
          cursor = new Date(cursor.getTime() + stepMs);
        }
      }

      logAudit(LOG_LEVEL.INFO, 'TOGGLE_SLOT_BLOCK', '', 'Slot sbloccato', {
        actor: 'admin', coachId: coach.id, slotStart: params.slot_start, slotEnd: params.slot_end
      });

      return successResponse({ message: 'Slot sbloccato.', action: 'unblocked' });
    }

  } catch (err) {
    logAudit(LOG_LEVEL.ERROR, 'TOGGLE_SLOT_BLOCK', '', err.message, { params: params });
    return errorResponse('Errore nella gestione del blocco.', 'TOGGLE_SLOT_BLOCK_ERROR');
  }
}

function handleCancelBooking(params) {
  try {
    const token = (params.token || params.cancel_token || '').trim();
    if (!token) return errorResponse('Token di cancellazione mancante.', 'MISSING_TOKEN');

    const booking = getBookingByToken(token);
    if (!booking) {
      return errorResponse('Prenotazione non trovata o link non valido.', 'BOOKING_NOT_FOUND');
    }
    if (String(booking.status) === BOOKING_STATUS.CANCELLED) {
      return errorResponse('Questa prenotazione è già stata cancellata.', 'ALREADY_CANCELLED');
    }

    const coach = getCoachById(String(booking.coach_id));

    const calendarId = String(booking.calendar_id || '');
    const eventId    = String(booking.event_id    || '');
    if (calendarId && eventId) cancelCalendarEvent(calendarId, eventId);

    updateBookingStatus(String(booking.booking_id), BOOKING_STATUS.CANCELLED);

    logAudit(LOG_LEVEL.INFO, 'CANCEL_BOOKING', String(booking.booking_id),
      'Prenotazione cancellata tramite token', { clientEmail: booking.client_email });

    if (coach) {
      sendCancellationToClient(booking, coach);
      sendCancellationToCoach(booking, coach);
    }

    // Notify seller if booking has a seller_id
    if (booking.seller_id) {
      try {
        const seller = getSellerById(String(booking.seller_id));
        if (seller && seller.email) {
          sendSellerCancellation(seller, booking, coach);
        }
      } catch (sellerErr) {
        logAudit(LOG_LEVEL.WARN, 'CANCEL_BOOKING', String(booking.booking_id),
          'Email cancellazione venditore non inviata: ' + sellerErr.message, {});
      }
    }

    return successResponse({
      message: 'Prenotazione cancellata con successo.',
      booking_id: String(booking.booking_id)
    });

  } catch (err) {
    logAudit(LOG_LEVEL.ERROR, 'CANCEL_BOOKING', '', err.message, {});
    return errorResponse('Errore durante la cancellazione. Riprova.', 'CANCEL_BOOKING_ERROR');
  }
}
