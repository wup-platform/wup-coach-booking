/**
 * Config.gs
 * Configurazione globale del sistema WUP Coach Booking.
 * Modifica questi valori prima del deploy.
 */

// ID del Google Spreadsheet "Master Coaching" (source of truth)
const SPREADSHEET_ID = '1Riwitz-Qwip2HctDWBmrCXM5XfbEZ3sEkSA5RPKT1GI';

// Email dell'amministratore WUP (riceve alert tecnici)
const ADMIN_EMAIL = 'luca.sammarco@alfiobardolla.com';

// Email mittente per tutte le email transazionali
// IMPORTANTE: deve essere configurata come alias "Invia come" nel tuo Gmail
const SENDER_EMAIL = 'info@alfiobardolla.com';
const SENDER_NAME  = 'Alfio Bardolla Training Group';

// Nome dell'applicazione (usato nei template email e log)
const APP_NAME = 'WUP Coach Booking';

// URL pubblico della Web App (da aggiornare dopo il primo deploy)
const APP_URL = 'https://script.google.com/macros/s/AKfycbyRPpzCcN0h2kMyg6xKVMJroRZwQqYyxXtGmuaqtHh8BCVVQbHvT6DKjzJs0HrqFtyv/exec';

// Fuso orario di riferimento per tutti i calcoli di data/ora
const TIMEZONE = 'Europe/Rome';

// Durata della sessione in minuti (usata se il coach non ha un valore specifico)
const SLOT_DURATION_DEFAULT_MIN = 15;

// Pausa tra una sessione e la successiva (minuti)
const SLOT_BREAK_MIN = 5;

// Date dell'evento (formato YYYY-MM-DD) – solo questi giorni sono prenotabili
const EVENT_DATE_START = '2026-03-13';
const EVENT_DATE_END   = '2026-03-15';

// Numero massimo di giorni avanti per cui mostrare la disponibilità
const DAYS_AHEAD_MAX = 30;

// Ora minima prenotabile (fallback se il coach non ha working_hours_start)
const BOOKING_WINDOW_START_HOUR = 8;

// Ora massima prenotabile (fallback se il coach non ha working_hours_end)
const BOOKING_WINDOW_END_HOUR = 19;

// Timeout in millisecondi per LockService (30 secondi)
const LOCK_TIMEOUT_MS = 30000;

// Nomi dei fogli nel Google Spreadsheet
const SHEETS = {
  COACHES:  'Coaches',
  BOOKINGS: 'Bookings',
  AUDIT:    'Audit',
  SELLERS:  'Sellers'
};

// Valori possibili per il campo status nel foglio Bookings
const BOOKING_STATUS = {
  CONFIRMED:  'CONFIRMED',
  CANCELLED:  'CANCELLED'
};

// Livelli di log per il foglio Audit
const LOG_LEVEL = {
  INFO:  'INFO',
  WARN:  'WARN',
  ERROR: 'ERROR'
};

// Token segreto per la dashboard admin (Alessia).
// Genera con generateToken() e incollalo qui, poi rideploya.
const DASHBOARD_ADMIN_TOKEN = 'f05edf3584610138878f6d799daea1fd';
