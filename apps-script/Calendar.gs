/**
 * Calendar.gs
 * Gestione Google Calendar per WUP Coach Booking.
 * Lavora sui calendari "Managed" di proprietà dell'account WUP Admin.
 */

function getAvailableSlots(coach, dateStr) {
  try {
    const parts = dateStr.split('-');
    const year = parseInt(parts[0]);
    const month = parseInt(parts[1]) - 1;
    const day = parseInt(parts[2]);

    const testDate = new Date(year, month, day);
    void testDate; // nessun blocco per giorno della settimana – gestito dal calendario

    const startParts = String(coach.working_hours_start || '').split(':');
    const startHour  = parseInt(startParts[0]) || BOOKING_WINDOW_START_HOUR;
    const startMin   = parseInt(startParts[1]) || 0;
    const endParts   = String(coach.working_hours_end || '').split(':');
    const endHour    = parseInt(endParts[0]) || BOOKING_WINDOW_END_HOUR;
    const endMin     = parseInt(endParts[1]) || 0;
    const slotMin    = parseInt(coach.slot_duration_min) || SLOT_DURATION_DEFAULT_MIN;

    const calendar = CalendarApp.getCalendarById(coach.calendar_managed_id);
    if (!calendar) throw new Error('Calendario non trovato per il coach: ' + coach.id);

    const dayStart = new Date(year, month, day, startHour, startMin, 0);
    const dayEnd   = new Date(year, month, day, endHour, endMin, 0);
    const now      = new Date();

    const existingEvents = calendar.getEvents(dayStart, dayEnd);

    const availableSlots = [];
    let slotStart = new Date(dayStart);

    while (true) {
      const slotEnd = new Date(slotStart.getTime() + slotMin * 60 * 1000);
      if (slotEnd > dayEnd) break;

      if (slotStart > now && !_isSlotOccupied(slotStart, slotEnd, existingEvents)) {
        availableSlots.push({
          start: slotStart.toISOString(),
          end:   slotEnd.toISOString(),
          available: true
        });
      }

      slotStart = new Date(slotEnd.getTime() + SLOT_BREAK_MIN * 60 * 1000);
    }

    return availableSlots;

  } catch (err) {
    logAudit(LOG_LEVEL.ERROR, 'GET_AVAILABLE_SLOTS', '',
      'Errore nel calcolo degli slot: ' + err.message, { coachId: coach.id, dateStr: dateStr });
    throw err;
  }
}

function getAvailabilitySummary(coach, fromDate, toDate) {
  const results = [];
  const start   = new Date(fromDate + 'T00:00:00');
  const end     = new Date(toDate   + 'T23:59:59');
  const now     = new Date();
  const todayStr = Utilities.formatDate(now, TIMEZONE, 'yyyy-MM-dd');
  const current = new Date(start);

  while (current <= end) {
    const dateStr = Utilities.formatDate(current, TIMEZONE, 'yyyy-MM-dd');

    if (dateStr >= todayStr) {
      try {
        const slots = getAvailableSlots(coach, dateStr);
        results.push({ date: dateStr, hasSlots: slots.length > 0 });
      } catch (err) {
        results.push({ date: dateStr, hasSlots: false });
      }
    } else {
      results.push({ date: dateStr, hasSlots: false });
    }

    current.setDate(current.getDate() + 1);
  }

  return results;
}

function createCalendarEvent(coach, bookingData) {
  try {
    const startDate     = parseDateTime(bookingData.start_datetime);
    const endDate       = parseDateTime(bookingData.end_datetime);
    const coachFullName = (coach.nome || '') + ' ' + (coach.cognome || '');
    const clientFullName = bookingData.client_name + ' ' + bookingData.client_surname;
    const durataMin     = Math.round((endDate - startDate) / 60000);

    const title = 'Wake Up Call – ' + clientFullName + ' con ' + coachFullName.trim();

    const description = [
      '=== PRENOTAZIONE WAKE UP CALL COACH BOOKING ===',
      'Booking ID: ' + bookingData.booking_id,
      'Cliente: ' + clientFullName,
      'Coach: ' + coachFullName.trim(),
      'Durata: ' + durataMin + ' minuti',
      'Creato il: ' + formatDateItalian(new Date()),
      '======================================='
    ].join('\n');

    // LIVESTREAM: usa Calendar Advanced Service per creare evento con Google Meet
    if (bookingData.modalita === MODALITA.LIVESTREAM) {
      var event = Calendar.Events.insert({
        summary: title,
        description: description,
        start: { dateTime: startDate.toISOString(), timeZone: TIMEZONE },
        end: { dateTime: endDate.toISOString(), timeZone: TIMEZONE },
        attendees: [
          { email: coach.email },
          { email: bookingData.client_email }
        ],
        conferenceData: {
          createRequest: {
            requestId: bookingData.booking_id + '-meet',
            conferenceSolutionKey: { type: 'hangoutsMeet' }
          }
        }
      }, coach.calendar_managed_id, { conferenceDataVersion: 1, sendUpdates: 'none' });

      var meetLink = '';
      if (event.conferenceData && event.conferenceData.entryPoints) {
        for (var j = 0; j < event.conferenceData.entryPoints.length; j++) {
          if (event.conferenceData.entryPoints[j].entryPointType === 'video') {
            meetLink = event.conferenceData.entryPoints[j].uri;
            break;
          }
        }
      }

      logAudit(LOG_LEVEL.INFO, 'CREATE_CALENDAR_EVENT', bookingData.booking_id,
        'Evento LIVESTREAM creato con Meet', { eventId: event.id, calendarId: coach.calendar_managed_id, meetLink: meetLink });

      return { eventId: event.id, calendarId: coach.calendar_managed_id, meetLink: meetLink };
    }

    // LIVE (default): usa CalendarApp standard
    const calendar = CalendarApp.getCalendarById(coach.calendar_managed_id);
    if (!calendar) throw new Error('Calendario Managed non trovato per coach: ' + coach.id);

    const calEvent = calendar.createEvent(title, startDate, endDate, {
      description: description,
      sendInvites: false
    });

    calEvent.addGuest(coach.email);
    calEvent.addGuest(bookingData.client_email);

    logAudit(LOG_LEVEL.INFO, 'CREATE_CALENDAR_EVENT', bookingData.booking_id,
      'Evento creato', { eventId: calEvent.getId(), calendarId: coach.calendar_managed_id });

    return { eventId: calEvent.getId(), calendarId: coach.calendar_managed_id, meetLink: '' };

  } catch (err) {
    logAudit(LOG_LEVEL.ERROR, 'CREATE_CALENDAR_EVENT', bookingData.booking_id,
      'Errore creazione evento: ' + err.message, { coachId: coach.id });
    throw err;
  }
}

function cancelCalendarEvent(calendarId, eventId) {
  try {
    const calendar = CalendarApp.getCalendarById(calendarId);
    if (!calendar) return false;
    const event = calendar.getEventById(eventId);
    if (!event) return false;
    event.deleteEvent();
    logAudit(LOG_LEVEL.INFO, 'CANCEL_CALENDAR_EVENT', '',
      'Evento eliminato', { eventId: eventId, calendarId: calendarId });
    return true;
  } catch (err) {
    logAudit(LOG_LEVEL.ERROR, 'CANCEL_CALENDAR_EVENT', '',
      'Errore eliminazione evento: ' + err.message, { eventId: eventId });
    return false;
  }
}

function checkEventExists(calendarId, eventId) {
  try {
    if (!calendarId || !eventId) return false;
    const calendar = CalendarApp.getCalendarById(calendarId);
    if (!calendar) return false;
    return calendar.getEventById(eventId) !== null;
  } catch (err) {
    return false;
  }
}

function _isSlotOccupied(slotStart, slotEnd, events) {
  for (let i = 0; i < events.length; i++) {
    const eStart = events[i].getStartTime();
    const eEnd   = events[i].getEndTime();
    if (slotStart < eEnd && slotEnd > eStart) return true;
  }
  return false;
}
