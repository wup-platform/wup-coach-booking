/**
 * Code.gs
 * Entry point della Web App Google Apps Script per WUP Coach Booking.
 */

function doGet(e) {
  try {
    const params = e.parameter || {};
    const action = params.action || '';
    Logger.log('doGet - action: ' + action);

    switch (action) {
      case 'listCoaches':             return handleListCoaches(params);
      case 'getAvailability':         return handleGetAvailability(params);
      case 'getAvailabilitySummary':  return handleGetAvailabilitySummary(params);
      case 'cancel':
        if (params.token) {
          const result = handleCancelBooking(params);
          return _buildCancelPageResponse(params.token, result);
        }
        return errorResponse('Token di cancellazione mancante.', 'MISSING_TOKEN');
      case 'getAdminBookings':   return handleGetAdminBookings(params);
      case 'getCoachBookings':   return handleGetCoachBookings(params);
      case 'getCoachLinks':      return handleGetCoachLinks(params);
      case 'get_sellers':        return handleGetSellers(params);
      case 'getSellerLinks':     return handleGetSellerLinks(params);
      case 'seller_bookings':    return handleSellerBookings(params);
      case 'seller_auth':        return handleSellerAuth(params);
      case 'getCoachSlots':      return handleGetCoachSlots(params);
      default:
        return _buildWelcomePage();
    }
  } catch (err) {
    logAudit(LOG_LEVEL.ERROR, 'DO_GET', '', err.message, {});
    return errorResponse('Errore interno del server.', 'INTERNAL_ERROR');
  }
}

function doPost(e) {
  try {
    let action, params;

    // Supporta sia JSON body che form-data / URL-encoded
    if (e.postData && e.postData.contents) {
      try {
        const body = JSON.parse(e.postData.contents);
        action = body.action || '';
        params = body.params || body;
      } catch(pe) {
        // Non è JSON — prova form-data (e.parameter)
        params = e.parameter || {};
        action = params.action || '';
      }
    } else if (e.parameter && e.parameter.action) {
      params = e.parameter;
      action = params.action;
    } else {
      return errorResponse('Body mancante.', 'MISSING_BODY');
    }

    Logger.log('doPost - action: ' + action);

    switch (action) {
      case 'createBooking':           return handleCreateBooking(params);
      case 'cancelBooking':           return handleCancelBooking(params);
      case 'listCoaches':             return handleListCoaches(params);
      case 'getAvailability':         return handleGetAvailability(params);
      case 'getAvailabilitySummary':  return handleGetAvailabilitySummary(params);
      case 'adminCancelBooking':      return handleAdminCancelBooking(params);
      case 'updateBookingOutcome':    return handleUpdateBookingOutcome(params);
      case 'updateSalesforceFlag':   return handleUpdateSalesforceFlag(params);
      case 'updateBookingNotes':     return handleUpdateBookingNotes(params);
      case 'get_sellers':            return handleGetSellers(params);
      case 'seller_bookings':        return handleSellerBookings(params);
      case 'seller_auth':            return handleSellerAuth(params);
      case 'seller_update_esito':    return handleSellerUpdateEsito(params);
      case 'seller_update_salesforce': return handleSellerUpdateSalesforce(params);
      case 'toggleSlotBlock':          return handleToggleSlotBlock(params);
      default:
        return errorResponse('Action non riconosciuta: ' + action, 'UNKNOWN_ACTION');
    }
  } catch (err) {
    logAudit(LOG_LEVEL.ERROR, 'DO_POST', '', err.message, {});
    return errorResponse('Errore interno del server.', 'INTERNAL_ERROR');
  }
}

/**
 * Trigger orario: controlla che gli eventi calendario delle prenotazioni CONFIRMED esistano ancora.
 * Configura in: Trigger > Aggiungi trigger > checkCalendarAudit > Ogni ora
 */
function checkCalendarAudit() {
  try {
    Logger.log('checkCalendarAudit: avvio...');
    const confirmed = getBookingsByStatus(BOOKING_STATUS.CONFIRMED);
    const anomalie  = [];

    for (let i = 0; i < confirmed.length; i++) {
      const b = confirmed[i];
      const calId   = String(b.calendar_id || '');
      const eventId = String(b.event_id    || '');
      if (!calId || !eventId) continue;

      if (!checkEventExists(calId, eventId)) {
        const a = { booking_id: b.booking_id, coach_id: b.coach_id,
                    client_email: b.client_email, start_datetime: b.start_datetime,
                    event_id: eventId, calendar_id: calId };
        anomalie.push(a);
        logAudit(LOG_LEVEL.WARN, 'CALENDAR_AUDIT', String(b.booking_id),
          'Evento mancante per prenotazione CONFIRMED', a);
      }
    }

    if (anomalie.length > 0) {
      sendAdminAlert(
        'Anomalie calendario (' + anomalie.length + ')',
        'Prenotazioni CONFIRMED senza evento calendario:\n\n' + JSON.stringify(anomalie, null, 2)
      );
    }

    Logger.log('checkCalendarAudit: completato. Anomalie: ' + anomalie.length);
  } catch (err) {
    logAudit(LOG_LEVEL.ERROR, 'CALENDAR_AUDIT', '', err.message, {});
    sendAdminAlert('Errore in checkCalendarAudit', err.message);
  }
}

function _buildCancelPageResponse(token, apiResult) {
  try {
    const r       = JSON.parse(apiResult.getContent());
    const success = r.success === true;
    const message = success ? (r.data && r.data.message || 'Prenotazione cancellata.') : (r.error || 'Errore.');
    const color   = success ? '#27ae60' : '#e74c3c';
    const icon    = success ? '&#10003;' : '&#10007;';
    const title   = success ? 'Prenotazione cancellata' : 'Errore cancellazione';

    const bgColor  = success ? '#eaf7ef' : '#fdecea';
    const html = '<!DOCTYPE html><html lang="it"><head><meta charset="UTF-8">' +
      '<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1">' +
      '<title>' + title + '</title>' +
      '<style>*{box-sizing:border-box;margin:0;padding:0}' +
      'body{font-family:Arial,Helvetica,sans-serif;background:#f4f4f4;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:20px}' +
      '.card{background:#fff;border-radius:16px;width:100%;max-width:420px;overflow:hidden;box-shadow:0 8px 32px rgba(0,0,0,.12)}' +
      '.card-header{background:linear-gradient(135deg,#E57711 0%,#c96510 100%);padding:20px 24px;text-align:center}' +
      '.logo{color:#fff;font-size:22px;font-weight:800;letter-spacing:2px}' +
      '.logo-sub{color:rgba(255,255,255,.8);font-size:11px;margin-top:2px;letter-spacing:.5px;text-transform:uppercase}' +
      '.card-body{padding:36px 28px;text-align:center}' +
      '.icon-circle{width:72px;height:72px;border-radius:50%;background:' + bgColor + ';display:flex;align-items:center;justify-content:center;margin:0 auto 20px;font-size:32px;color:' + color + '}' +
      'h1{font-size:20px;color:#111;margin-bottom:10px;font-weight:700}' +
      '.msg{color:#555;font-size:14px;line-height:1.6;margin-bottom:24px}' +
      '.btn{display:block;background:#31B15C;color:#fff;padding:14px 24px;border-radius:8px;text-decoration:none;font-size:15px;font-weight:700;transition:background .2s}' +
      '.btn:hover{background:#279a4f}' +
      '.brand{color:#aaa;font-size:11px;margin-top:20px;padding-top:16px;border-top:1px solid #f0f0f0}' +
      '</style></head>' +
      '<body><div class="card">' +
      '<div class="card-header"><div class="logo">Wake Up Call</div><div class="logo-sub">Coach Booking Platform</div></div>' +
      '<div class="card-body">' +
      '<div class="icon-circle">' + icon + '</div>' +
      '<h1>' + title + '</h1>' +
      '<p class="msg">' + message + '</p>' +
      '<a href="https://lp.alfiobardolla.com/prenotazione-wup/" class="btn">Prenota una nuova sessione</a>' +
      '<p class="brand">&copy; ' + new Date().getFullYear() + ' Wake Up Call Coach Booking — ABTG</p>' +
      '</div></div></body></html>';

    return HtmlService.createHtmlOutput(html).setTitle(title)
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  } catch (err) {
    return HtmlService.createHtmlOutput('<p>Operazione completata. <a href="' + APP_URL + '">Torna alla home</a></p>');
  }
}

function _buildWelcomePage() {
  const html = '<!DOCTYPE html><html lang="it"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + APP_NAME + '</title>' +
    '<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:Arial,sans-serif;background:#1a1a2e;color:#fff;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px}' +
    '.logo{font-size:48px;font-weight:bold;letter-spacing:4px;color:#e94560;margin-bottom:8px}.subtitle{font-size:16px;color:#a0a0c0;margin-bottom:40px}' +
    '.box{background:#16213e;border-radius:10px;padding:28px 36px;max-width:500px;width:100%}.box h2{color:#e94560;margin-bottom:12px;font-size:18px}' +
    '.ep{background:#0f3460;border-radius:6px;padding:8px 14px;margin:6px 0;font-family:monospace;font-size:13px;color:#7fdbff}' +
    '.ep span{color:#a0a0c0;font-family:sans-serif;font-size:11px;display:block;margin-top:2px}' +
    '.footer{margin-top:40px;color:#555;font-size:12px}</style></head>' +
    '<body><div class="logo">Wake Up Call</div><div class="subtitle">Coach Booking Platform</div>' +
    '<div class="box"><h2>Sistema operativo &#10003;</h2>' +
    '<div class="ep">GET ?action=listCoaches<span>Lista coach attivi</span></div>' +
    '<div class="ep">GET ?action=getAvailability&amp;coach_id=X&amp;date=YYYY-MM-DD<span>Slot disponibili</span></div>' +
    '<div class="ep">GET ?action=getAvailabilitySummary&amp;coach_id=X&amp;from_date=...&amp;to_date=...<span>Riepilogo mese</span></div>' +
    '<div class="ep">GET ?action=cancel&amp;token=TOKEN<span>Cancellazione via link email</span></div>' +
    '<div class="ep">POST {action:"createBooking",...}<span>Crea prenotazione</span></div>' +
    '</div><div class="footer">&copy; ' + new Date().getFullYear() + ' Wake Up Call Coach Booking</div></body></html>';

  return HtmlService.createHtmlOutput(html).setTitle(APP_NAME)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
