/**
 * app.js – WUP Coach Booking Frontend
 * Vanilla JS, nessuna dipendenza esterna.
 */

// =====================================================
// CONFIGURAZIONE – aggiorna con l'URL della Web App
// =====================================================
const API_URL = 'https://script.google.com/macros/s/AKfycbxThGV2uPEFwE8dG2k2u1H7ODTm7ZouodsSwc4SD_CWZQA3R567DjrVsTjqrdktXZ-1/exec';

// =====================================================
// CONFIGURAZIONE EVENTO
// =====================================================
const EVENT_DATES = ['2026-03-13', '2026-03-14', '2026-03-15'];

// =====================================================
// STATO APPLICAZIONE
// =====================================================
const state = {
  coaches:       [],
  selectedCoach: null,   // oggetto coach
  selectedDate:  null,   // 'YYYY-MM-DD'
  selectedSlot:  null,   // {start, end}
  summaryCache:  {},     // { 'coachId': { 'YYYY-MM-DD': bool } }
  slotsCache:    {},     // { 'coachId_YYYY-MM-DD': [slots] }
};

// =====================================================
// UTILITY
// =====================================================

/** Legge un parametro dall'URL corrente */
function getURLParam(name) {
  return new URLSearchParams(window.location.search).get(name);
}

/** Formatta 'YYYY-MM-DD' → 'Lunedì 10 marzo 2025' (italiano) */
function formatDateIT(dateStr) {
  const giorni = ['domenica','lunedì','martedì','mercoledì','giovedì','venerdì','sabato'];
  const mesi   = ['gennaio','febbraio','marzo','aprile','maggio','giugno',
                  'luglio','agosto','settembre','ottobre','novembre','dicembre'];
  const d = new Date(dateStr + 'T12:00:00');
  return giorni[d.getDay()] + ' ' + d.getDate() + ' ' + mesi[d.getMonth()] + ' ' + d.getFullYear();
}

/** Formatta ISOstring → 'HH:MM' */
function formatTime(isoStr) {
  const d = new Date(isoStr);
  return String(d.getHours()).padStart(2,'0') + ':' + String(d.getMinutes()).padStart(2,'0');
}

/** Formatta data breve 'YYYY-MM-DD' → 'gg/mm/aaaa' */
function formatDateShort(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  return d + '/' + m + '/' + y;
}

/** Tronca testo a N caratteri */
function truncate(str, n) {
  if (!str) return '';
  return str.length > n ? str.substring(0, n) + '…' : str;
}

/** Sanitizza contenuto testuale (usa textContent, non innerHTML) */
function setText(el, text) {
  if (el) el.textContent = text || '';
}

/** Mostra/nasconde elemento */
function show(el) { if (el) el.classList.remove('hidden'); }
function hide(el) { if (el) el.classList.add('hidden'); }

/** Avatar SVG di fallback */
function avatarFallback(name) {
  const initials = (name || '?').split(' ').map(w => w[0]).join('').substring(0,2).toUpperCase();
  return 'data:image/svg+xml,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="88" height="88" viewBox="0 0 88 88">' +
    '<rect width="88" height="88" rx="44" fill="#0f3460"/>' +
    '<text x="44" y="58" font-family="Arial" font-size="30" font-weight="bold" fill="#e94560" text-anchor="middle">' +
    initials + '</text></svg>'
  );
}

/** Mostra alert globale */
function showAlert(type, message) {
  const el = document.getElementById('global-alert');
  if (!el) return;
  el.className = 'alert alert-' + type;
  const icons = { success: '✓', error: '✕', warning: 'ℹ' };
  el.innerHTML = '<span class="alert-icon">' + (icons[type] || '') + '</span><span></span>';
  el.querySelector('span:last-child').textContent = message;
  show(el);
  el.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function hideAlert() {
  const el = document.getElementById('global-alert');
  if (el) hide(el);
}

/** Spinner nel container */
function showLoading(container, text) {
  container.innerHTML =
    '<div class="loading-overlay">' +
    '<div class="spinner"></div>' +
    '<p class="loading-text">' + (text || 'Caricamento...') + '</p>' +
    '</div>';
}

/** Messaggio errore nel container */
function showContainerError(container, message, onRetry) {
  container.innerHTML =
    '<div class="alert alert-error" style="max-width:480px;margin:32px auto">' +
    '<span class="alert-icon">✕</span>' +
    '<div><strong>Errore</strong><p style="margin-top:4px">' + message + '</p>' +
    (onRetry ? '<button class="btn btn-sm btn-outline" style="margin-top:12px" id="retry-btn">Riprova</button>' : '') +
    '</div></div>';
  if (onRetry) {
    const btn = container.querySelector('#retry-btn');
    if (btn) btn.addEventListener('click', onRetry);
  }
}

// =====================================================
// API CALLS
// =====================================================

async function fetchCoaches() {
  const res = await fetch(API_URL + '?action=listCoaches');
  if (!res.ok) throw new Error('Errore di rete (' + res.status + ')');
  const json = await res.json();
  if (!json.success) throw new Error(json.error || 'Errore sconosciuto');
  return json.data.coaches;
}

async function fetchAvailabilitySummary(coachId, fromDate, toDate) {
  const url = API_URL +
    '?action=getAvailabilitySummary' +
    '&coach_id=' + encodeURIComponent(coachId) +
    '&from_date=' + encodeURIComponent(fromDate) +
    '&to_date='   + encodeURIComponent(toDate);
  const res  = await fetch(url);
  const json = await res.json();
  if (!json.success) throw new Error(json.error || 'Errore disponibilità');
  return json.data.dates; // [{date, hasSlots}]
}

async function fetchSlots(coachId, date) {
  const url = API_URL +
    '?action=getAvailability' +
    '&coach_id=' + encodeURIComponent(coachId) +
    '&date='     + encodeURIComponent(date);
  const res  = await fetch(url);
  const json = await res.json();
  if (!json.success) throw new Error(json.error || 'Errore slot');
  return json.data.slots; // [{start, end, available}]
}

async function createBooking(data) {
  const res = await fetch(API_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ action: 'createBooking', ...data })
  });
  const json = await res.json();
  return json; // { success, data | error, code }
}

// =====================================================
// INDEX PAGE – lista coach
// =====================================================

async function initIndexPage() {
  const container = document.getElementById('coaches-container');
  if (!container) return;

  try {
    showLoading(container, 'Caricamento coach...');
    const coaches = await fetchCoaches();
    state.coaches = coaches;

    if (!coaches || coaches.length === 0) {
      container.innerHTML = '<p style="text-align:center;color:var(--gray-text);padding:48px">Nessun coach disponibile al momento.</p>';
      return;
    }

    renderCoaches(container, coaches);

  } catch (err) {
    showContainerError(container, 'Impossibile caricare i coach. Controlla la connessione.', initIndexPage);
  }
}

function renderCoaches(container, coaches) {
  container.innerHTML = '';

  const h = document.createElement('div');
  h.innerHTML =
    '<p class="section-subtitle">Seleziona un coach per prenotare la tua sessione WUP</p>';
  container.appendChild(h);

  const grid = document.createElement('div');
  grid.className = 'coach-grid fade-in';

  coaches.forEach(function(coach) {
    const fullName = (coach.nome || '') + ' ' + (coach.cognome || '');
    const card     = document.createElement('div');
    card.className = 'coach-card';

    // Avatar
    const img = document.createElement('img');
    img.className = 'coach-avatar';
    img.alt       = fullName;
    img.src       = avatarFallback(fullName);
    if (coach.foto_url) {
      const tmp = new Image();
      tmp.onload  = () => { img.src = coach.foto_url; };
      tmp.onerror = () => {};
      tmp.src = coach.foto_url;
    }

    // Top section
    const top = document.createElement('div');
    top.className = 'coach-card-top';

    const nameEl = document.createElement('div');
    nameEl.className = 'coach-name';
    nameEl.textContent = fullName.trim();

    const roleEl = document.createElement('div');
    roleEl.className = 'coach-role';
    roleEl.textContent = coach.ruolo || '';

    top.appendChild(img);
    top.appendChild(nameEl);
    top.appendChild(roleEl);

    // Body
    const body = document.createElement('div');
    body.className = 'coach-card-body';

    const bio = document.createElement('p');
    bio.className = 'coach-bio';
    bio.textContent = truncate(coach.bio || '', 120);

    const btn = document.createElement('a');
    btn.className = 'btn btn-primary';
    btn.textContent = 'Prenota ora';
    btn.href = 'booking.html?coach=' + encodeURIComponent(coach.id);

    body.appendChild(bio);
    body.appendChild(btn);

    card.appendChild(top);
    card.appendChild(body);
    grid.appendChild(card);
  });

  container.appendChild(grid);
}

// =====================================================
// BOOKING PAGE
// =====================================================

async function initBookingPage() {
  const coachId = getURLParam('coach');
  if (!coachId) {
    window.location.href = 'index.html';
    return;
  }

  // Controlla se è una pagina di cancellazione
  const cancelToken = getURLParam('cancel') || getURLParam('token');
  if (cancelToken) {
    initCancelPage(cancelToken);
    return;
  }

  // Carica info coach
  try {
    const coaches = await fetchCoaches();
    const coach   = coaches.find(c => String(c.id) === String(coachId));
    if (!coach) {
      showAlert('error', 'Coach non trovato. Torna alla lista e riprova.');
      return;
    }
    state.selectedCoach = coach;
    renderCoachInfoBar(coach);
  } catch (err) {
    showAlert('error', 'Impossibile caricare le informazioni del coach.');
    return;
  }

  // Carica disponibilità per le 3 date evento e renderizza
  await loadEventDatesSummary();
  renderEventDates();

  // Step 2 → back
  document.getElementById('btn-back-to-cal').addEventListener('click', function() {
    state.selectedSlot = null;
    showStep(1);
  });

  // Step 3 → back
  document.getElementById('btn-back-to-slots').addEventListener('click', function() {
    showStep(2);
  });

  // Form submit
  document.getElementById('booking-form').addEventListener('submit', async function(e) {
    e.preventDefault();
    await submitBooking();
  });

  showStep(1);
}

function renderCoachInfoBar(coach) {
  const bar = document.getElementById('coach-info-bar');
  if (!bar) return;

  const fullName = (coach.nome || '') + ' ' + (coach.cognome || '');
  const nameEl   = document.getElementById('coach-name-bar');
  const roleEl   = document.getElementById('coach-role-bar');
  const imgEl    = document.getElementById('coach-avatar');

  if (nameEl) nameEl.textContent = fullName.trim();
  if (roleEl) roleEl.textContent = coach.ruolo || '';

  if (imgEl) {
    imgEl.src = avatarFallback(fullName);
    imgEl.alt = fullName;
    if (coach.foto_url) {
      const tmp  = new Image();
      tmp.onload = () => { imgEl.src = coach.foto_url; };
      tmp.src    = coach.foto_url;
    }
  }

  show(bar);

  // Titolo pagina
  document.title = 'Prenota con ' + fullName.trim() + ' – WUP';
}

// ── Date Evento ──────────────────────────────────────

async function loadEventDatesSummary() {
  const coachId = state.selectedCoach.id;
  if (!state.summaryCache[coachId]) state.summaryCache[coachId] = {};

  // Marca le 3 date come "loading"
  EVENT_DATES.forEach(d => {
    if (state.summaryCache[coachId][d] === undefined) {
      state.summaryCache[coachId][d] = null;
    }
  });

  try {
    const summary = await fetchAvailabilitySummary(coachId, EVENT_DATES[0], EVENT_DATES[EVENT_DATES.length - 1]);
    summary.forEach(function(item) {
      state.summaryCache[coachId][item.date] = item.hasSlots;
    });
  } catch (err) {
    EVENT_DATES.forEach(d => { state.summaryCache[coachId][d] = false; });
  }
}

function renderEventDates() {
  const container = document.getElementById('cal-days');
  container.innerHTML = '';

  // Nascondi navigazione mese (non serve per evento fisso)
  const calHeader = document.getElementById('cal-header');
  if (calHeader) calHeader.style.display = 'none';

  const coachId = state.selectedCoach.id;
  const cache   = state.summaryCache[coachId] || {};

  const grid = document.createElement('div');
  grid.style.cssText = 'display:flex;flex-direction:column;gap:12px;max-width:400px;margin:0 auto;';

  EVENT_DATES.forEach(function(dateStr) {
    const hasSlots = cache[dateStr];
    const btn      = document.createElement('button');
    btn.type       = 'button';

    const label = formatDateIT(dateStr);

    if (hasSlots === null) {
      btn.textContent = label + ' — verifica disponibilità...';
      btn.className   = 'date-event-btn loading';
      btn.disabled    = true;
    } else if (hasSlots === true) {
      btn.textContent = label;
      btn.className   = 'date-event-btn available' + (state.selectedDate === dateStr ? ' selected' : '');
      btn.addEventListener('click', () => onDateSelected(dateStr));
    } else {
      btn.textContent = label + ' — non disponibile';
      btn.className   = 'date-event-btn unavailable';
      btn.disabled    = true;
    }

    grid.appendChild(btn);
  });

  container.appendChild(grid);
}

function toDateStr(date) {
  return date.getFullYear() + '-' +
    String(date.getMonth() + 1).padStart(2,'0') + '-' +
    String(date.getDate()).padStart(2,'0');
}

async function onDateSelected(dateStr) {
  state.selectedDate = dateStr;
  renderCalendar(state.currentMonth); // aggiorna selezione visiva

  showStep(2);
  document.getElementById('slots-date-label').textContent = formatDateIT(dateStr);

  const slotsGrid = document.getElementById('slots-grid');
  showLoading(slotsGrid, 'Caricamento orari...');

  try {
    const cacheKey = state.selectedCoach.id + '_' + dateStr;
    let slots = state.slotsCache[cacheKey];

    if (!slots) {
      slots = await fetchSlots(state.selectedCoach.id, dateStr);
      state.slotsCache[cacheKey] = slots;
    }

    renderSlots(slotsGrid, slots, dateStr);
  } catch (err) {
    slotsGrid.innerHTML = '<div class="alert alert-error"><span>Impossibile caricare gli orari. Riprova.</span></div>';
  }
}

function renderSlots(container, slots, dateStr) {
  container.innerHTML = '';

  if (!slots || slots.length === 0) {
    container.innerHTML =
      '<div class="alert alert-warning"><span class="alert-icon">ℹ</span>' +
      '<span>Nessuno slot disponibile per questa data. Seleziona un\'altra data.</span></div>';

    // Rimuovi disponibilità dalla cache
    if (state.selectedCoach) {
      const cache = state.summaryCache[state.selectedCoach.id];
      if (cache) cache[dateStr] = false;
    }
    return;
  }

  slots.forEach(function(slot) {
    const chip = document.createElement('button');
    chip.type      = 'button';
    chip.className = 'slot-chip';
    chip.textContent = formatTime(slot.start);
    chip.setAttribute('aria-label', 'Prenota alle ' + formatTime(slot.start));

    if (state.selectedSlot && state.selectedSlot.start === slot.start) {
      chip.classList.add('selected');
    }

    chip.addEventListener('click', function() {
      document.querySelectorAll('.slot-chip').forEach(c => c.classList.remove('selected'));
      chip.classList.add('selected');
      onSlotSelected(slot);
    });

    container.appendChild(chip);
  });
}

function onSlotSelected(slot) {
  state.selectedSlot = slot;

  const coach = state.selectedCoach;
  const fullName = (coach.nome || '') + ' ' + (coach.cognome || '');

  // Aggiorna riepilogo
  setText(document.getElementById('sum-coach'), fullName.trim());
  setText(document.getElementById('sum-date'),  formatDateShort(state.selectedDate));
  setText(document.getElementById('sum-time'),  formatTime(slot.start));

  showStep(3);
}

// ── Form & Submit ───────────────────────────────────

function validateForm() {
  const fields  = ['name','surname','email','phone'];
  const labels  = { name:'Nome', surname:'Cognome', email:'Email', phone:'Telefono' };
  let valid     = true;

  fields.forEach(function(f) {
    const input = document.getElementById('f-' + f);
    const errEl = document.getElementById('err-' + f);
    const val   = input ? input.value.trim() : '';

    hide(errEl);
    input && input.classList.remove('error');

    if (!val) {
      if (errEl) { errEl.textContent = labels[f] + ' è obbligatorio.'; show(errEl); }
      if (input) input.classList.add('error');
      valid = false;
    } else if (f === 'email') {
      const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!re.test(val)) {
        if (errEl) { errEl.textContent = 'Inserisci un indirizzo email valido.'; show(errEl); }
        if (input) input.classList.add('error');
        valid = false;
      }
    }
  });

  // Privacy
  const privacy = document.getElementById('f-privacy');
  const errPr   = document.getElementById('err-privacy');
  hide(errPr);
  if (privacy && !privacy.checked) {
    if (errPr) { errPr.textContent = 'Devi accettare la privacy policy per procedere.'; show(errPr); }
    valid = false;
  }

  return valid;
}

async function submitBooking() {
  hideAlert();
  if (!validateForm()) return;

  const submitBtn  = document.getElementById('btn-submit');
  const btnText    = document.getElementById('btn-submit-text');
  const btnSpinner = document.getElementById('btn-submit-spinner');

  submitBtn.disabled = true;
  hide(btnText);
  show(btnSpinner);

  const data = {
    coach_id:        state.selectedCoach.id,
    start_datetime:  state.selectedSlot.start,
    client_name:     document.getElementById('f-name').value.trim(),
    client_surname:  document.getElementById('f-surname').value.trim(),
    client_email:    document.getElementById('f-email').value.trim(),
    client_phone:    document.getElementById('f-phone').value.trim(),
    notes:           document.getElementById('f-notes').value.trim(),
    privacy_consent: document.getElementById('f-privacy').checked
  };

  try {
    const result = await createBooking(data);

    if (result.success) {
      const coach    = state.selectedCoach;
      const fullName = (coach.nome || '') + ' ' + (coach.cognome || '');

      setText(document.getElementById('conf-coach'), fullName.trim());
      setText(document.getElementById('conf-date'),  formatDateIT(state.selectedDate));
      setText(document.getElementById('conf-time'),  formatTime(state.selectedSlot.start));
      setText(document.getElementById('conf-id'),    result.data.booking_id || '');
      setText(document.getElementById('conf-email-msg'),
        'Riceverai una email di conferma all\'indirizzo ' + data.client_email);

      showStep(4);
    } else {
      const code = result.code || '';
      if (code === 'SLOT_NOT_AVAILABLE') {
        showAlert('error', 'Spiacenti, questo slot è stato appena prenotato da un altro utente. Seleziona un altro orario.');
        showStep(2);
        // Invalida cache per questo slot
        const cacheKey = state.selectedCoach.id + '_' + state.selectedDate;
        delete state.slotsCache[cacheKey];
        state.selectedSlot = null;
      } else {
        showAlert('error', result.error || 'Errore durante la prenotazione. Riprova.');
      }
    }
  } catch (err) {
    showAlert('error', 'Errore di connessione. Verifica la tua rete e riprova.');
  } finally {
    submitBtn.disabled = false;
    show(btnText);
    hide(btnSpinner);
  }
}

// ── Step management ──────────────────────────────────

function showStep(n) {
  for (let i = 1; i <= 4; i++) {
    const el = document.getElementById('step-' + i);
    if (el) (i === n ? show(el) : hide(el));

    const ind  = document.getElementById('step-ind-' + i);
    const line = document.getElementById('step-line-' + i);
    if (ind) {
      ind.classList.remove('active','done');
      if (i < n)  ind.classList.add('done');
      if (i === n) ind.classList.add('active');
    }
    if (line) {
      line.classList.remove('done');
      if (i < n) line.classList.add('done');
    }
  }
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ── Cancellazione via link ───────────────────────────

async function initCancelPage(token) {
  // Mostra step 4 con messaggio di caricamento
  for (let i = 1; i <= 3; i++) {
    const el = document.getElementById('step-' + i);
    if (el) hide(el);
  }
  hide(document.getElementById('step-indicator'));

  const step4 = document.getElementById('step-4');
  if (!step4) return;
  show(step4);

  step4.innerHTML =
    '<div class="confirmation-box">' +
    '<div class="loading-overlay"><div class="spinner"></div>' +
    '<p class="loading-text">Cancellazione in corso...</p></div></div>';

  try {
    const res  = await fetch(API_URL + '?action=cancel&token=' + encodeURIComponent(token));
    const json = await res.json();

    if (json.success) {
      step4.innerHTML =
        '<div class="cancel-box slide-up">' +
        '<div class="icon" style="color:var(--success)">&#10003;</div>' +
        '<h2>Prenotazione cancellata</h2>' +
        '<p>La tua prenotazione è stata cancellata con successo.<br>Hai ricevuto una email di conferma.</p>' +
        '<a href="index.html" class="btn btn-primary">Prenota una nuova sessione</a></div>';
    } else {
      step4.innerHTML =
        '<div class="cancel-box slide-up">' +
        '<div class="icon" style="color:var(--error)">&#10007;</div>' +
        '<h2>Errore cancellazione</h2>' +
        '<p>' + (json.error || 'Il link non è valido o la prenotazione non esiste.') + '</p>' +
        '<a href="index.html" class="btn btn-outline">Torna alla home</a></div>';
    }
  } catch (err) {
    step4.innerHTML =
      '<div class="cancel-box slide-up">' +
      '<div class="icon" style="color:var(--error)">&#10007;</div>' +
      '<h2>Errore di connessione</h2>' +
      '<p>Impossibile completare la cancellazione. Riprova più tardi.</p>' +
      '<a href="index.html" class="btn btn-outline">Torna alla home</a></div>';
  }
}

// =====================================================
// INIT – rileva la pagina e avvia la funzione corretta
// =====================================================
document.addEventListener('DOMContentLoaded', function() {
  const path = window.location.pathname;

  if (path.endsWith('booking.html') || getURLParam('coach') || getURLParam('cancel')) {
    initBookingPage();
  } else {
    // index.html o root
    initIndexPage();
  }
});
