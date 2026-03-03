/**
 * Email.gs
 * Invio email transazionali per WUP Coach Booking.
 * Mittente: SENDER_EMAIL (alias Gmail configurato in Config.gs)
 */

function sendBookingConfirmationToClient(bookingData, coach) {
  try {
    const coachFullName = (coach.nome || '') + ' ' + (coach.cognome || '');
    const startDate = parseDateTime(bookingData.start_datetime);
    const endDate   = parseDateTime(bookingData.end_datetime);
    const durataMin = Math.round((endDate - startDate) / 60000);
    const cancelUrl = APP_URL + '?action=cancel&token=' + bookingData.cancel_token;

    const bodyHtml = [
      '<p>Ciao <strong>' + sanitizeString(bookingData.client_name) + '</strong>,</p>',
      '<p>la tua sessione con <strong>' + sanitizeString(coachFullName.trim()) + '</strong> è confermata.</p>',
      '<hr>',
      '<table style="border-collapse:collapse;width:100%">',
      _tr('Coach', sanitizeString(coachFullName.trim()), false),
      _tr('Ruolo', sanitizeString(coach.ruolo || ''), true),
      _tr('Data e ora', formatDateItalian(startDate), false),
      _tr('Durata', durataMin + ' minuti', true),
      _tr('Codice prenotazione', bookingData.booking_id, false),
      bookingData.notes ? _tr('Note', sanitizeString(bookingData.notes), true) : '',
      '</table>',
      '<hr>',
      '<p>Riceverai un invito nel tuo calendario Google.</p>',
      '<p style="margin:20px 0 10px">Per cancellare la prenotazione (almeno 24h prima dell\'evento):</p>',
      '<p style="margin:0 0 8px"><a href="' + cancelUrl + '" class="cancel-btn" style="display:inline-block;background:#dc3545;color:#fff;padding:13px 28px;text-decoration:none;border-radius:6px;font-size:15px;font-weight:700;letter-spacing:.3px">&#x2715; Cancella prenotazione</a></p>',
      '<p style="font-size:11px;color:#999;margin:12px 0 0;word-break:break-all">Oppure copia questo link nel browser: ' + cancelUrl + '</p>'
    ].join('');

    GmailApp.sendEmail(
      bookingData.client_email,
      'Confermata la tua sessione WUP con ' + coachFullName.trim(),
      '',
      {
        from:     SENDER_EMAIL,
        name:     SENDER_NAME,
        htmlBody: buildEmailTemplate('Prenotazione confermata', bodyHtml)
      }
    );

    logAudit(LOG_LEVEL.INFO, 'EMAIL_CLIENT', bookingData.booking_id,
      'Email conferma inviata a ' + bookingData.client_email, {});
  } catch (err) {
    logAudit(LOG_LEVEL.ERROR, 'EMAIL_CLIENT', bookingData.booking_id,
      'Errore email cliente: ' + err.message, {});
  }
}

function sendBookingNotificationToCoach(bookingData, coach) {
  try {
    const coachFullName  = (coach.nome || '') + ' ' + (coach.cognome || '');
    const clientFullName = bookingData.client_name + ' ' + bookingData.client_surname;
    const startDate = parseDateTime(bookingData.start_datetime);
    const endDate   = parseDateTime(bookingData.end_datetime);
    const durataMin = Math.round((endDate - startDate) / 60000);

    const bodyHtml = [
      '<p>Ciao <strong>' + sanitizeString(coachFullName.trim()) + '</strong>,</p>',
      '<p>hai una nuova prenotazione WUP.</p>',
      '<hr>',
      '<table style="border-collapse:collapse;width:100%">',
      _tr('Cliente', sanitizeString(clientFullName), false),
      _tr('Email', sanitizeString(bookingData.client_email), true),
      _tr('Telefono', sanitizeString(bookingData.client_phone || 'Non fornito'), false),
      _tr('Data e ora', formatDateItalian(startDate), true),
      _tr('Durata', durataMin + ' minuti', false),
      _tr('Codice', bookingData.booking_id, true),
      bookingData.notes ? _tr('Note', sanitizeString(bookingData.notes), false) : '',
      '</table>',
      '<hr>',
      '<p>L\'evento è stato aggiunto al tuo calendario Google "Managed".</p>'
    ].join('');

    GmailApp.sendEmail(
      coach.email,
      'Nuova prenotazione WUP: ' + clientFullName + ' – ' +
        Utilities.formatDate(startDate, TIMEZONE, 'dd/MM/yyyy'),
      '',
      {
        from:     SENDER_EMAIL,
        name:     SENDER_NAME,
        htmlBody: buildEmailTemplate('Nuova prenotazione', bodyHtml)
      }
    );

    logAudit(LOG_LEVEL.INFO, 'EMAIL_COACH', bookingData.booking_id,
      'Email notifica inviata a ' + coach.email, {});
  } catch (err) {
    logAudit(LOG_LEVEL.ERROR, 'EMAIL_COACH', bookingData.booking_id,
      'Errore email coach: ' + err.message, {});
  }
}

function sendCancellationToClient(bookingData, coach) {
  try {
    const coachFullName = (coach.nome || '') + ' ' + (coach.cognome || '');
    const startDate = parseDateTime(String(bookingData.start_datetime));

    const bodyHtml = [
      '<p>Ciao <strong>' + sanitizeString(bookingData.client_name) + '</strong>,</p>',
      '<p>la tua prenotazione con <strong>' + sanitizeString(coachFullName.trim()) + '</strong> è stata cancellata.</p>',
      '<hr>',
      '<table style="border-collapse:collapse;width:100%">',
      _tr('Coach', sanitizeString(coachFullName.trim()), false),
      _tr('Data e ora', formatDateItalian(startDate), true),
      _tr('Codice', String(bookingData.booking_id), false),
      '</table>',
      '<hr>',
      '<p><a href="https://lp.alfiobardolla.com/prenotazione-wup/" style="background:#3498db;color:#fff;padding:10px 20px;text-decoration:none;border-radius:4px;">Prenota una nuova sessione</a></p>'
    ].join('');

    GmailApp.sendEmail(
      bookingData.client_email,
      'Prenotazione WUP cancellata – ' + Utilities.formatDate(startDate, TIMEZONE, 'dd/MM/yyyy'),
      '',
      {
        from:     SENDER_EMAIL,
        name:     SENDER_NAME,
        htmlBody: buildEmailTemplate('Prenotazione cancellata', bodyHtml)
      }
    );
  } catch (err) {
    logAudit(LOG_LEVEL.ERROR, 'EMAIL_CANCEL_CLIENT', String(bookingData.booking_id),
      'Errore: ' + err.message, {});
  }
}

function sendCancellationToCoach(bookingData, coach) {
  try {
    const coachFullName  = (coach.nome || '') + ' ' + (coach.cognome || '');
    const clientFullName = bookingData.client_name + ' ' + bookingData.client_surname;
    const startDate = parseDateTime(String(bookingData.start_datetime));

    const bodyHtml = [
      '<p>Ciao <strong>' + sanitizeString(coachFullName.trim()) + '</strong>,</p>',
      '<p>La prenotazione di <strong>' + sanitizeString(clientFullName) + '</strong> è stata cancellata.</p>',
      '<hr>',
      '<table style="border-collapse:collapse;width:100%">',
      _tr('Data e ora', formatDateItalian(startDate), false),
      _tr('Codice', String(bookingData.booking_id), true),
      '</table>',
      '<p>L\'evento è stato rimosso dal tuo calendario. Lo slot è di nuovo disponibile.</p>'
    ].join('');

    GmailApp.sendEmail(
      coach.email,
      'Prenotazione cancellata: ' + clientFullName + ' – ' +
        Utilities.formatDate(startDate, TIMEZONE, 'dd/MM/yyyy'),
      '',
      {
        from:     SENDER_EMAIL,
        name:     SENDER_NAME,
        htmlBody: buildEmailTemplate('Prenotazione cancellata', bodyHtml)
      }
    );
  } catch (err) {
    logAudit(LOG_LEVEL.ERROR, 'EMAIL_CANCEL_COACH', String(bookingData.booking_id),
      'Errore: ' + err.message, {});
  }
}

function sendAdminAlert(subject, message) {
  try {
    const bodyHtml = '<pre style="background:#f4f4f4;padding:12px;border-radius:4px">' +
      sanitizeString(message) + '</pre>' +
      '<p style="color:#888;font-size:11px">Timestamp: ' + formatDatetime(new Date()) + '</p>';
    GmailApp.sendEmail(
      ADMIN_EMAIL,
      '[WUP ALERT] ' + subject,
      '',
      {
        from:     SENDER_EMAIL,
        name:     SENDER_NAME,
        htmlBody: buildEmailTemplate('Alert Tecnico WUP', bodyHtml)
      }
    );
  } catch (err) {
    Logger.log('CRITICO: impossibile inviare alert admin - ' + err.message);
  }
}

function buildEmailTemplate(title, bodyHtml) {
  return '<!DOCTYPE html><html lang="it"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">' +
  '<style>body{margin:0;padding:0;font-family:Arial,Helvetica,sans-serif;background:#f4f4f4}' +
  'table{border-collapse:collapse}img{border:0;display:block}' +
  '@media only screen and (max-width:620px){' +
  '.outer-table{width:100%!important}.inner-card{width:100%!important;border-radius:0!important}' +
  '.body-td{padding:24px 16px!important}.header-td{padding:20px 16px!important}.sub-td{padding:14px 16px!important}' +
  '.cancel-btn{display:block!important;text-align:center!important;padding:14px 20px!important;font-size:16px!important}' +
  '</style>' +
  '</head>' +
  '<body style="margin:0;padding:0;background:#f4f4f4">' +
  '<table width="100%" cellpadding="0" cellspacing="0" role="presentation"><tr><td align="center" style="padding:24px 12px">' +
  '<table class="inner-card" width="580" cellpadding="0" cellspacing="0" role="presentation" style="background:#fff;border-radius:10px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.10);max-width:580px;width:100%">' +
  '<tr><td class="header-td" style="background:linear-gradient(135deg,#E57711 0%,#c96510 100%);padding:24px 32px;text-align:center">' +
  '<h1 style="color:#fff;margin:0;font-size:24px;letter-spacing:2px;font-weight:800">WUP</h1>' +
  '<p style="color:rgba(255,255,255,.85);margin:4px 0 0;font-size:12px;letter-spacing:.5px;text-transform:uppercase">Coach Booking Platform</p></td></tr>' +
  '<tr><td class="sub-td" style="background:#f9f0e6;padding:14px 32px;border-bottom:2px solid #E57711">' +
  '<h2 style="color:#E57711;margin:0;font-size:15px;font-weight:700">' + title + '</h2></td></tr>' +
  '<tr><td class="body-td" style="padding:28px 32px;color:#333;font-size:14px;line-height:1.65">' + bodyHtml + '</td></tr>' +
  '<tr><td style="background:#f9f9f9;padding:18px 32px;border-top:1px solid #eee;text-align:center">' +
  '<p style="color:#888;font-size:12px;margin:0">&copy; ' + new Date().getFullYear() + ' WUP Coach Booking — Alfio Bardolla Training Group</p>' +
  '<p style="color:#aaa;font-size:11px;margin:4px 0 0">Email automatica generata dal sistema. Non rispondere a questo messaggio.</p>' +
  '</td></tr></table>' +
  '</td></tr></table></body></html>';
}

// Helper: riga tabella email alternata
function _tr(label, value, alt) {
  const bg = alt ? 'background:#f9f9f9;' : '';
  return '<tr style="' + bg + '"><td style="padding:6px;font-weight:bold">' + label + ':</td>' +
         '<td style="padding:6px">' + value + '</td></tr>';
}
