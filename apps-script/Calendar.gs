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

    const startHour = parseInt(coach.working_hours_start) || BOOKING_WINDOW_START_HOUR;
    const endHour   = parseInt(coach.working_hours_end)   || BOOKING_WINDOW_END_HOUR;
    const slotMin   = parseInt(coach.slot_duration_min)   || SLOT_DURATION_DEFAULT_MIN;

    const calendar = CalendarApp.getCalendarById(coach.calendar_managed_id);
    if (!calendar) throw new Error('Calendario non trovato per il coach: ' + coach.id);

    const dayStart = new Date(year, month, day, startHour, 0, 0);
    const dayEnd   = new Date(year, month, day, endHour, 0, 0);
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

      slotStart = new Date(slotEnd);
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
  const start   = new Date(fromDate + 'T12:00:00');
  const end     = new Date(toDate   + 'T12:00:00');
  const now     = new Date();
  const current = new Date(start);

  while (current <= end) {
    const dateStr = Utilities.formatDate(current, TIMEZONE, 'yyyy-MM-dd');

    if (current >= now) {
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
    const calendar = CalendarApp.getCalendarById(coach.calendar_managed_id);
    if (!calendar) throw new Error('Calendario Managed non trovato per coach: ' + coach.id);

    const startDate     = parseDateTime(bookingData.start_datetime);
    const endDate       = parseDateTime(bookingData.end_datetime);
    const coachFullName = (coach.nome || '') + ' ' + (coach.cognome || '');
    const clientFullName = bookingData.client_name + ' ' + bookingData.client_surname;
    const durataMin     = Math.round((endDate - startDate) / 60000);

    const title = 'WUP – ' + clientFullName + ' con ' + coachFullName.trim();

    const description = [
      '=== PRENOTAZIONE WUP COACH BOOKING ===',
      'Booking ID: ' + bookingData.booking_id,
      'Cliente: ' + clientFullName,
      'Email cliente: ' + bookingData.client_email,
      'Telefono: ' + (bookingData.client_phone || 'Non fornito'),
      'Coach: ' + coachFullName.trim(),
      'Durata: ' + durataMin + ' minuti',
      'Note: ' + (bookingData.notes || 'Nessuna'),
      'Creato il: ' + formatDateItalian(new Date()),
      '======================================='
    ].join('\n');

    const event = calendar.createEvent(title, startDate, endDate, {
      description: description,
      sendInvites: false
    });

    event.addGuest(coach.email);
    event.addGuest(bookingData.client_email);

    logAudit(LOG_LEVEL.INFO, 'CREATE_CALENDAR_EVENT', bookingData.booking_id,
      'Evento creato', { eventId: event.getId(), calendarId: coach.calendar_managed_id });

    return { eventId: event.getId(), calendarId: coach.calendar_managed_id };

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
