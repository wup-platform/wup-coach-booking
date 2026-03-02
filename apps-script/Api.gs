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
      calendar_id:    ''
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

    return successResponse({
      message: 'Prenotazione cancellata con successo.',
      booking_id: String(booking.booking_id)
    });

  } catch (err) {
    logAudit(LOG_LEVEL.ERROR, 'CANCEL_BOOKING', '', err.message, {});
    return errorResponse('Errore durante la cancellazione. Riprova.', 'CANCEL_BOOKING_ERROR');
  }
}
