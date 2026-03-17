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
      '</table>',
      '<hr>',
      (function() {
        var mod = String(bookingData.modalita || 'LIVE');
        var ml  = String(bookingData.meet_link || '');
        if (mod === 'LIVESTREAM' && ml) {
          return '<div style="margin:20px 0;padding:20px;background:#e8f5e9;border-radius:10px;text-align:center">' +
            '<p style="margin:0 0 12px;font-size:14px;color:#2e7d32;font-weight:700">La tua sessione si svolgerà online via Google Meet</p>' +
            '<a href="' + ml + '" style="display:inline-block;background:#1a73e8;color:#fff;padding:16px 36px;text-decoration:none;border-radius:8px;font-size:17px;font-weight:800;letter-spacing:.5px">Link Google Meet</a>' +
            '<p style="margin:10px 0 0;font-size:11px;color:#888;word-break:break-all">' + ml + '</p></div>';
        }
        return '';
      })(),
      '<p>Riceverai un invito nel tuo calendario Google.</p>',
      '<p style="margin:20px 0 10px">Per cancellare la prenotazione (almeno 24h prima dell\'evento):</p>',
      '<p style="margin:0 0 8px"><a href="' + cancelUrl + '" class="cancel-btn" style="display:inline-block;background:#dc3545;color:#fff;padding:13px 28px;text-decoration:none;border-radius:6px;font-size:15px;font-weight:700;letter-spacing:.3px">&#x2715; Cancella prenotazione</a></p>',
      '<p style="font-size:11px;color:#999;margin:12px 0 0;word-break:break-all">Oppure copia questo link nel browser: ' + cancelUrl + '</p>'
    ].join('');

    GmailApp.sendEmail(
      bookingData.client_email,
      'Prenotazione Coaching Confermata – ' + coachFullName.trim(),
      '',
      {
        from:     SENDER_EMAIL,
        name:     SENDER_NAME,
        htmlBody: buildEmailTemplate('Prenotazione Coaching Confermata', bodyHtml)
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
      '<p>hai una nuova prenotazione Wake Up Call.</p>',
      '<hr>',
      '<table style="border-collapse:collapse;width:100%">',
      _tr('Cliente', sanitizeString(clientFullName), false),
      _tr('Email', sanitizeString(bookingData.client_email), true),
      _tr('Telefono', sanitizeString(bookingData.client_phone || 'Non fornito'), false),
      _tr('Data e ora', formatDateItalian(startDate), true),
      _tr('Durata', durataMin + ' minuti', false),
      _tr('Codice', bookingData.booking_id, true),
      bookingData.notes ? _tr('Note', sanitizeString(bookingData.notes), false) : '',
      bookingData.seller_name ? _tr('Venditore', sanitizeString(bookingData.seller_name), !bookingData.notes) : '',
      '</table>',
      '<hr>',
      (function() {
        var mod = String(bookingData.modalita || 'LIVE');
        var ml  = String(bookingData.meet_link || '');
        if (mod === 'LIVESTREAM' && ml) {
          return '<div style="margin:16px 0;padding:16px;background:#e8f5e9;border-radius:8px;text-align:center">' +
            '<p style="margin:0 0 10px;font-size:13px;color:#2e7d32;font-weight:700">Sessione LIVESTREAM — Google Meet</p>' +
            '<a href="' + ml + '" style="display:inline-block;background:#1a73e8;color:#fff;padding:14px 28px;text-decoration:none;border-radius:8px;font-size:15px;font-weight:700">Entra in Meet</a>' +
            '<p style="margin:8px 0 0;font-size:11px;color:#888;word-break:break-all">' + ml + '</p></div>';
        }
        return '';
      })(),
      '<p>L\'evento è stato aggiunto al tuo calendario Google "Managed".</p>'
    ].join('');

    GmailApp.sendEmail(
      coach.email,
      'Nuova prenotazione Wake Up Call: ' + clientFullName + ' – ' +
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
      'Prenotazione Coaching Cancellata – ' + Utilities.formatDate(startDate, TIMEZONE, 'dd/MM/yyyy'),
      '',
      {
        from:     SENDER_EMAIL,
        name:     SENDER_NAME,
        htmlBody: buildEmailTemplate('Prenotazione Coaching Cancellata', bodyHtml)
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
      'Prenotazione Coaching Cancellata: ' + clientFullName + ' – ' +
        Utilities.formatDate(startDate, TIMEZONE, 'dd/MM/yyyy'),
      '',
      {
        from:     SENDER_EMAIL,
        name:     SENDER_NAME,
        htmlBody: buildEmailTemplate('Prenotazione Coaching Cancellata', bodyHtml)
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
      '[Wake Up Call ALERT] ' + subject,
      '',
      {
        from:     SENDER_EMAIL,
        name:     SENDER_NAME,
        htmlBody: buildEmailTemplate('Alert Tecnico Wake Up Call', bodyHtml)
      }
    );
  } catch (err) {
    Logger.log('CRITICO: impossibile inviare alert admin - ' + err.message);
  }
}

/**
 * Invia al coach il link personale per la sua dashboard (read-only).
 */
function sendDashboardLinkToCoach(coach, url) {
  const coachFullName = ((coach.nome || '') + ' ' + (coach.cognome || '')).trim();
  const bodyHtml = [
    '<p>Ciao <strong>' + sanitizeString(coachFullName) + '</strong>,</p>',
    '<p>ecco il tuo link personale per consultare le prenotazioni Wake Up Call 13-15 marzo 2026:</p>',
    '<p style="margin:20px 0">',
    '<a href="' + url + '" style="display:inline-block;background:#E57711;color:#fff;padding:14px 28px;',
    'text-decoration:none;border-radius:8px;font-size:15px;font-weight:700">',
    'Vedi i tuoi appuntamenti</a></p>',
    '<p style="font-size:12px;color:#888;word-break:break-all">Link diretto: ' + url + '</p>',
    '<p style="font-size:12px;color:#aaa">Il link è personale e riservato a te. Non condividerlo.</p>'
  ].join('');

  GmailApp.sendEmail(
    coach.email,
    '[Wake Up Call] Il tuo link dashboard prenotazioni',
    'Accedi alla tua dashboard: ' + url,
    {
      from:     SENDER_EMAIL,
      name:     SENDER_NAME,
      htmlBody: buildEmailTemplate('La tua dashboard Wake Up Call', bodyHtml)
    }
  );

  logAudit(LOG_LEVEL.INFO, 'DASHBOARD_LINK_SENT', '',
    'Link dashboard inviato a ' + coach.email, { coachId: coach.id });
}

/**
 * Invia email di conferma prenotazione al venditore.
 */
function sendSellerConfirmation(sellerEmail, sellerName, coachFullName, clientFullName, startDt, endDt, bookingId) {
  try {
    const durataMin = Math.round((endDt - startDt) / 60000);

    const bodyHtml = [
      '<p>Ciao <strong>' + sanitizeString(sellerName.trim()) + '</strong>,</p>',
      '<p>hai prenotato una sessione per <strong>' + sanitizeString(clientFullName) + '</strong> con <strong>' + sanitizeString(coachFullName) + '</strong>.</p>',
      '<hr>',
      '<table style="border-collapse:collapse;width:100%">',
      _tr('Cliente', sanitizeString(clientFullName), false),
      _tr('Coach', sanitizeString(coachFullName), true),
      _tr('Data e ora', formatDateItalian(startDt), false),
      _tr('Durata', durataMin + ' minuti', true),
      _tr('Codice prenotazione', bookingId, false),
      '</table>',
      '<hr>',
      '<p>La prenotazione è stata confermata. Il cliente riceverà un invito nel calendario.</p>'
    ].join('');

    GmailApp.sendEmail(
      sellerEmail,
      'Prenotazione Coaching Confermata – ' + clientFullName + ' con ' + coachFullName,
      '',
      {
        from:     SENDER_EMAIL,
        name:     SENDER_NAME,
        htmlBody: buildEmailTemplate('Prenotazione Coaching Confermata', bodyHtml)
      }
    );

    logAudit(LOG_LEVEL.INFO, 'EMAIL_SELLER', bookingId,
      'Email conferma inviata al venditore ' + sellerEmail, {});
  } catch (err) {
    logAudit(LOG_LEVEL.ERROR, 'EMAIL_SELLER', bookingId,
      'Errore email venditore: ' + err.message, {});
  }
}

/**
 * Invia email di cancellazione al venditore.
 */
function sendSellerCancellation(seller, bookingData, coach) {
  try {
    const sellerFullName = ((seller.nome || '') + ' ' + (seller.cognome || '')).trim();
    const coachFullName  = coach ? ((coach.nome || '') + ' ' + (coach.cognome || '')).trim() : '';
    const clientFullName = (bookingData.client_name || '') + ' ' + (bookingData.client_surname || '');
    const startDate = parseDateTime(String(bookingData.start_datetime));

    const bodyHtml = [
      '<p>Ciao <strong>' + sanitizeString(sellerFullName) + '</strong>,</p>',
      '<p>la prenotazione che avevi effettuato per <strong>' + sanitizeString(clientFullName) + '</strong>',
      coachFullName ? ' con <strong>' + sanitizeString(coachFullName) + '</strong>' : '',
      ' è stata cancellata.</p>',
      '<hr>',
      '<table style="border-collapse:collapse;width:100%">',
      _tr('Cliente', sanitizeString(clientFullName), false),
      coachFullName ? _tr('Coach', sanitizeString(coachFullName), true) : '',
      _tr('Data e ora', formatDateItalian(startDate), false),
      _tr('Codice', String(bookingData.booking_id), true),
      '</table>',
      '<hr>',
      '<p>Lo slot del coach è di nuovo disponibile per una nuova prenotazione.</p>'
    ].join('');

    GmailApp.sendEmail(
      seller.email,
      'Prenotazione Cancellata – ' + clientFullName + ' – ' +
        Utilities.formatDate(startDate, TIMEZONE, 'dd/MM/yyyy'),
      '',
      {
        from:     SENDER_EMAIL,
        name:     SENDER_NAME,
        htmlBody: buildEmailTemplate('Prenotazione Coaching Cancellata', bodyHtml)
      }
    );

    logAudit(LOG_LEVEL.INFO, 'EMAIL_CANCEL_SELLER', String(bookingData.booking_id),
      'Email cancellazione inviata al venditore ' + seller.email, {});
  } catch (err) {
    logAudit(LOG_LEVEL.ERROR, 'EMAIL_CANCEL_SELLER', String(bookingData.booking_id),
      'Errore email cancellazione venditore: ' + err.message, {});
  }
}

/**
 * Invia al venditore il link personale per la sua dashboard.
 */
function sendDashboardLinkToSeller(seller, url) {
  const sellerFullName = ((seller.nome || '') + ' ' + (seller.cognome || '')).trim();
  const bodyHtml = [
    '<p>Ciao <strong>' + sanitizeString(sellerFullName) + '</strong>,</p>',
    '<p>ecco il tuo link personale per consultare le prenotazioni Wake Up Call 13-15 marzo 2026:</p>',
    '<p style="margin:20px 0">',
    '<a href="' + url + '" style="display:inline-block;background:#E57711;color:#fff;padding:14px 28px;',
    'text-decoration:none;border-radius:8px;font-size:15px;font-weight:700">',
    'Vedi le tue prenotazioni</a></p>',
    '<p style="font-size:12px;color:#888;word-break:break-all">Link diretto: ' + url + '</p>',
    '<p style="font-size:12px;color:#aaa">Il link è personale e riservato a te. Non condividerlo.</p>'
  ].join('');

  GmailApp.sendEmail(
    seller.email,
    '[Wake Up Call] Il tuo link dashboard prenotazioni',
    'Accedi alla tua dashboard: ' + url,
    {
      from:     SENDER_EMAIL,
      name:     SENDER_NAME,
      htmlBody: buildEmailTemplate('La tua dashboard Wake Up Call', bodyHtml)
    }
  );

  logAudit(LOG_LEVEL.INFO, 'DASHBOARD_LINK_SENT', '',
    'Link dashboard inviato al venditore ' + seller.email, { sellerId: seller.id });
}

/**
 * Notifica al venditore l'esito della sessione di coaching.
 */
function sendOutcomeToSeller(sellerEmail, sellerName, clientFullName, coachFullName, esito, bookingId) {
  try {
    var esitoLabels = {
      'VENDUTO':        '✅ Chiusa vinta',
      'NON_VENDUTO':    '❌ Chiusa persa',
      'IN_TRATTATIVA':  '🔄 Opportunità aperta',
      'NON_PRESENTATO': '🚫 Non presentato',
      'DA_DEFINIRE':    '⏳ Da definire'
    };
    var esitoLabel = esitoLabels[esito] || esito || '—';

    var esitoColor = esito === 'VENDUTO' ? '#065f46' :
                     esito === 'NON_VENDUTO' ? '#991b1b' :
                     esito === 'IN_TRATTATIVA' ? '#92400e' :
                     esito === 'NON_PRESENTATO' ? '#374151' :
                     esito === 'DA_DEFINIRE' ? '#6b21a8' : '#333';
    var esitoBg    = esito === 'VENDUTO' ? '#d1fae5' :
                     esito === 'NON_VENDUTO' ? '#fee2e2' :
                     esito === 'IN_TRATTATIVA' ? '#fef3c7' :
                     esito === 'NON_PRESENTATO' ? '#f3f4f6' :
                     esito === 'DA_DEFINIRE' ? '#f3e8ff' : '#f9f9f9';

    var bodyHtml = [
      '<p>Ciao <strong>' + sanitizeString(sellerName) + '</strong>,</p>',
      '<p>aggiornamento sull\'esito della sessione di coaching:</p>',
      '<hr>',
      '<table style="border-collapse:collapse;width:100%">',
      _tr('Cliente', sanitizeString(clientFullName), false),
      _tr('Coach', sanitizeString(coachFullName), true),
      '</table>',
      '<div style="margin:16px 0;padding:14px 20px;border-radius:8px;background:' + esitoBg + ';text-align:center">',
      '<span style="font-size:18px;font-weight:800;color:' + esitoColor + '">' + esitoLabel + '</span>',
      '</div>',
      '<hr>',
      '<p style="font-size:12px;color:#888">Codice prenotazione: ' + sanitizeString(bookingId) + '</p>'
    ].join('');

    var subject = esito === 'VENDUTO' ? '✅ Coaching chiusa vinta — ' + clientFullName :
                  esito === 'NON_VENDUTO' ? '❌ Coaching chiusa persa — ' + clientFullName :
                  esito === 'IN_TRATTATIVA' ? '🔄 Opportunità aperta — ' + clientFullName :
                  esito === 'NON_PRESENTATO' ? '🚫 Cliente non presentato — ' + clientFullName :
                  esito === 'DA_DEFINIRE' ? '⏳ Esito da definire — ' + clientFullName :
                  'Aggiornamento esito coaching — ' + clientFullName;

    GmailApp.sendEmail(
      sellerEmail,
      subject,
      '',
      {
        from:     SENDER_EMAIL,
        name:     SENDER_NAME,
        htmlBody: buildEmailTemplate('Esito Coaching', bodyHtml)
      }
    );

    logAudit(LOG_LEVEL.INFO, 'EMAIL_OUTCOME_SELLER', bookingId,
      'Email esito inviata al venditore ' + sellerEmail, { esito: esito });
  } catch (err) {
    logAudit(LOG_LEVEL.ERROR, 'EMAIL_OUTCOME_SELLER', bookingId,
      'Errore email esito venditore: ' + err.message, {});
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
  '<h1 style="color:#fff;margin:0;font-size:24px;letter-spacing:2px;font-weight:800">Wake Up Call</h1>' +
  '<p style="color:rgba(255,255,255,.85);margin:4px 0 0;font-size:12px;letter-spacing:.5px;text-transform:uppercase">Coach Booking Platform</p></td></tr>' +
  '<tr><td class="sub-td" style="background:#f9f0e6;padding:14px 32px;border-bottom:2px solid #E57711">' +
  '<h2 style="color:#E57711;margin:0;font-size:15px;font-weight:700">' + title + '</h2></td></tr>' +
  '<tr><td class="body-td" style="padding:28px 32px;color:#333;font-size:14px;line-height:1.65">' + bodyHtml + '</td></tr>' +
  '<tr><td style="background:#f9f9f9;padding:18px 32px;border-top:1px solid #eee;text-align:center">' +
  '<p style="color:#888;font-size:12px;margin:0">&copy; ' + new Date().getFullYear() + ' Wake Up Call Coach Booking — Alfio Bardolla Training Group</p>' +
  '<p style="color:#aaa;font-size:11px;margin:4px 0 0">Email automatica generata dal sistema. Non rispondere a questo messaggio.</p>' +
  '</td></tr></table>' +
  '</td></tr></table></body></html>';
}

/**
 * Invia email promemoria al cliente prima della sessione.
 * NOTA: Le note NON vengono incluse (sono private).
 */
function sendReminderToClient(bookingData, coach) {
  try {
    const coachFullName = (coach.nome || '') + ' ' + (coach.cognome || '');
    const startDate = parseDateTime(bookingData.start_datetime);
    const endDate   = parseDateTime(bookingData.end_datetime);
    const durataMin = Math.round((endDate - startDate) / 60000);
    var modalita    = String(bookingData.modalita || 'LIVE');
    var meetLink    = String(bookingData.meet_link || '');

    var modalitaHtml = '';
    if (modalita === 'LIVESTREAM' && meetLink) {
      modalitaHtml = [
        '<div style="margin:20px 0;padding:20px;background:#e8f5e9;border-radius:10px;text-align:center">',
        '<p style="margin:0 0 12px;font-size:14px;color:#2e7d32;font-weight:700">La tua sessione si svolge online via Google Meet</p>',
        '<a href="' + meetLink + '" style="display:inline-block;background:#1a73e8;color:#fff;padding:16px 36px;text-decoration:none;border-radius:8px;font-size:17px;font-weight:800;letter-spacing:.5px">Entra nella sessione Meet</a>',
        '<p style="margin:10px 0 0;font-size:11px;color:#888;word-break:break-all">' + meetLink + '</p>',
        '</div>'
      ].join('');
    } else {
      modalitaHtml = '<p style="margin:16px 0;padding:14px 20px;background:#fff3e0;border-radius:8px;color:#e65100;font-weight:600">Ricordati di presentarti in sede per la tua sessione.</p>';
    }

    const bodyHtml = [
      '<p>Ciao <strong>' + sanitizeString(bookingData.client_name) + '</strong>,</p>',
      '<p>la tua sessione di coaching sta per iniziare!</p>',
      '<hr>',
      '<table style="border-collapse:collapse;width:100%">',
      _tr('Coach', sanitizeString(coachFullName.trim()), false),
      _tr('Data e ora', formatDateItalian(startDate), true),
      _tr('Durata', durataMin + ' minuti', false),
      _tr('Codice prenotazione', String(bookingData.booking_id), true),
      '</table>',
      '<hr>',
      modalitaHtml
    ].join('');

    GmailApp.sendEmail(
      bookingData.client_email,
      'Promemoria: La tua sessione coaching è tra poco!',
      '',
      {
        from:     SENDER_EMAIL,
        name:     SENDER_NAME,
        htmlBody: buildEmailTemplate('Promemoria Sessione Coaching', bodyHtml)
      }
    );

    logAudit(LOG_LEVEL.INFO, 'EMAIL_REMINDER_CLIENT', String(bookingData.booking_id),
      'Promemoria inviato a ' + bookingData.client_email, {});
  } catch (err) {
    logAudit(LOG_LEVEL.ERROR, 'EMAIL_REMINDER_CLIENT', String(bookingData.booking_id),
      'Errore invio promemoria cliente: ' + err.message, {});
  }
}

/**
 * Invia email promemoria al coach prima della sessione.
 */
function sendReminderToCoach(bookingData, coach) {
  try {
    const coachFullName  = (coach.nome || '') + ' ' + (coach.cognome || '');
    const clientFullName = bookingData.client_name + ' ' + bookingData.client_surname;
    const startDate = parseDateTime(bookingData.start_datetime);
    const endDate   = parseDateTime(bookingData.end_datetime);
    const durataMin = Math.round((endDate - startDate) / 60000);
    var modalita    = String(bookingData.modalita || 'LIVE');
    var meetLink    = String(bookingData.meet_link || '');

    var meetHtml = '';
    if (modalita === 'LIVESTREAM' && meetLink) {
      meetHtml = [
        '<div style="margin:16px 0;padding:16px;background:#e8f5e9;border-radius:8px;text-align:center">',
        '<p style="margin:0 0 10px;font-size:13px;color:#2e7d32;font-weight:700">Sessione LIVESTREAM — Google Meet</p>',
        '<a href="' + meetLink + '" style="display:inline-block;background:#1a73e8;color:#fff;padding:14px 28px;text-decoration:none;border-radius:8px;font-size:15px;font-weight:700">Entra in Meet</a>',
        '<p style="margin:8px 0 0;font-size:11px;color:#888;word-break:break-all">' + meetLink + '</p>',
        '</div>'
      ].join('');
    }

    const bodyHtml = [
      '<p>Ciao <strong>' + sanitizeString(coachFullName.trim()) + '</strong>,</p>',
      '<p>hai una sessione di coaching tra poco con <strong>' + sanitizeString(clientFullName) + '</strong>.</p>',
      '<hr>',
      '<table style="border-collapse:collapse;width:100%">',
      _tr('Cliente', sanitizeString(clientFullName), false),
      _tr('Telefono', sanitizeString(bookingData.client_phone || 'Non fornito'), true),
      _tr('Data e ora', formatDateItalian(startDate), false),
      _tr('Durata', durataMin + ' minuti', true),
      _tr('Codice', String(bookingData.booking_id), false),
      bookingData.notes ? _tr('Note', sanitizeString(bookingData.notes), true) : '',
      '</table>',
      '<hr>',
      meetHtml
    ].join('');

    GmailApp.sendEmail(
      coach.email,
      'Promemoria: Sessione coaching tra poco con ' + clientFullName,
      '',
      {
        from:     SENDER_EMAIL,
        name:     SENDER_NAME,
        htmlBody: buildEmailTemplate('Promemoria Sessione Coaching', bodyHtml)
      }
    );

    logAudit(LOG_LEVEL.INFO, 'EMAIL_REMINDER_COACH', String(bookingData.booking_id),
      'Promemoria inviato a ' + coach.email, {});
  } catch (err) {
    logAudit(LOG_LEVEL.ERROR, 'EMAIL_REMINDER_COACH', String(bookingData.booking_id),
      'Errore invio promemoria coach: ' + err.message, {});
  }
}

// Helper: riga tabella email alternata
function _tr(label, value, alt) {
  const bg = alt ? 'background:#f9f9f9;' : '';
  return '<tr style="' + bg + '"><td style="padding:6px;font-weight:bold">' + label + ':</td>' +
         '<td style="padding:6px">' + value + '</td></tr>';
}
