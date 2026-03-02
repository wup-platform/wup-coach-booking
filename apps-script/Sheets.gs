/**
 * Sheets.gs
 * Funzioni per la lettura e scrittura del Google Spreadsheet.
 */

function getSpreadsheet() {
  return SpreadsheetApp.openById(SPREADSHEET_ID);
}

function getSheet(name) {
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName(name);
  if (!sheet) throw new Error('Foglio "' + name + '" non trovato nello spreadsheet.');
  return sheet;
}

function getAllCoaches() {
  const sheet = getSheet(SHEETS.COACHES);
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];
  const headers = data[0];
  const coaches = [];
  for (let i = 1; i < data.length; i++) {
    const coach = _rowToCoach(headers, data[i]);
    if (coach.active === true || coach.active === 'TRUE' || coach.active === 'true') {
      coaches.push(coach);
    }
  }
  return coaches;
}

function getCoachById(coachId) {
  const sheet = getSheet(SHEETS.COACHES);
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return null;
  const headers = data[0];
  const idIndex = headers.indexOf('id');
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][idIndex]) === String(coachId)) {
      return _rowToCoach(headers, data[i]);
    }
  }
  return null;
}

function createBooking(bookingData) {
  const sheet = getSheet(SHEETS.BOOKINGS);
  sheet.appendRow([
    bookingData.booking_id,
    bookingData.created_at,
    bookingData.coach_id,
    bookingData.coach_name,
    bookingData.coach_email,
    bookingData.client_name,
    bookingData.client_surname,
    bookingData.client_email,
    bookingData.client_phone || '',
    bookingData.start_datetime,
    bookingData.end_datetime,
    bookingData.timezone || TIMEZONE,
    bookingData.notes || '',
    bookingData.status,
    bookingData.cancel_token,
    bookingData.event_id || '',
    bookingData.calendar_id || '',
    '' // cancelled_at: vuoto alla creazione
  ]);
  return bookingData.booking_id;
}

function getBookingByToken(cancelToken) {
  const sheet = getSheet(SHEETS.BOOKINGS);
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return null;
  const headers = data[0];
  const tokenIndex = headers.indexOf('cancel_token');
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][tokenIndex]) === String(cancelToken)) {
      return _rowToBooking(headers, data[i], i + 1);
    }
  }
  return null;
}

function getBookingById(bookingId) {
  const sheet = getSheet(SHEETS.BOOKINGS);
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return null;
  const headers = data[0];
  const idIndex = headers.indexOf('booking_id');
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][idIndex]) === String(bookingId)) {
      return _rowToBooking(headers, data[i], i + 1);
    }
  }
  return null;
}

function updateBookingStatus(bookingId, status) {
  const sheet = getSheet(SHEETS.BOOKINGS);
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return false;
  const headers = data[0];
  const idIndex = headers.indexOf('booking_id');
  const statusIndex = headers.indexOf('status');
  const cancelledAtIndex = headers.indexOf('cancelled_at');
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][idIndex]) === String(bookingId)) {
      const rowNumber = i + 1;
      sheet.getRange(rowNumber, statusIndex + 1).setValue(status);
      if (status === BOOKING_STATUS.CANCELLED && cancelledAtIndex !== -1) {
        sheet.getRange(rowNumber, cancelledAtIndex + 1).setValue(formatDatetime(new Date()));
      }
      return true;
    }
  }
  return false;
}

function getBookingsByStatus(status) {
  const sheet = getSheet(SHEETS.BOOKINGS);
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];
  const headers = data[0];
  const statusIndex = headers.indexOf('status');
  const bookings = [];
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][statusIndex]) === String(status)) {
      bookings.push(_rowToBooking(headers, data[i], i + 1));
    }
  }
  return bookings;
}

function _rowToCoach(headers, row) {
  const coach = {};
  headers.forEach(function(h, i) { coach[h] = row[i]; });
  return coach;
}

function _rowToBooking(headers, row, rowNumber) {
  const booking = { _rowNumber: rowNumber };
  headers.forEach(function(h, i) { booking[h] = row[i]; });
  return booking;
}
