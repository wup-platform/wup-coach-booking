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
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];

  // Build row based on actual headers to handle dynamic columns
  const row = headers.map(function(h) {
    if (h === 'cancelled_at') return ''; // vuoto alla creazione
    if (bookingData.hasOwnProperty(h)) return bookingData[h] || '';
    return '';
  });

  sheet.appendRow(row);
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

// ─────────────────────────────────────────────────────────────────────────────
// SELLERS
// ─────────────────────────────────────────────────────────────────────────────

function getAllSellers() {
  const sheet = getSheet(SHEETS.SELLERS);
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];
  const headers = data[0];
  const sellers = [];
  for (let i = 1; i < data.length; i++) {
    const seller = _rowToSeller(headers, data[i]);
    if (seller.active === true || seller.active === 'TRUE' || seller.active === 'true') {
      sellers.push(seller);
    }
  }
  return sellers;
}

function getSellerById(sellerId) {
  const sheet = getSheet(SHEETS.SELLERS);
  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return null;
  const headers = data[0];
  const idIndex = headers.indexOf('id');
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][idIndex]) === String(sellerId)) {
      return _rowToSeller(headers, data[i]);
    }
  }
  return null;
}

function _rowToSeller(headers, row) {
  const seller = {};
  headers.forEach(function(h, i) { seller[h] = row[i]; });
  return seller;
}
