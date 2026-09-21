/**
 * Google kalendář – přihlášení a čtení událostí přímo z prohlížeče.
 *
 * Používá Google Identity Services (token pro OAuth 2.0 implicitní tok) a REST
 * Google Calendar API v3 přes `fetch`. Není potřeba žádný server: stačí OAuth
 * client ID typu „Webová aplikace“ s povoleným původem této stránky.
 *
 * Rozsah je jen pro čtení – aplikace do kalendáře nikdy nezapisuje.
 */

const GSI_SRC = 'https://accounts.google.com/gsi/client';
const API = 'https://www.googleapis.com/calendar/v3';
export const SCOPE = 'https://www.googleapis.com/auth/calendar.readonly';

let gsiLoading = null;
let tokenClient = null;
let token = null;       // { accessToken, expiresAt }
let tokenClientId = null;

/** Načte skript Google Identity Services až ve chvíli, kdy je potřeba (offline režim bez něj funguje). */
function loadGsi() {
  if (globalThis.google?.accounts?.oauth2) return Promise.resolve();
  if (gsiLoading) return gsiLoading;
  gsiLoading = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = GSI_SRC;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      gsiLoading = null;
      reject(new Error('Nepodařilo se načíst přihlašování Google. Zkontrolujte připojení k internetu.'));
    };
    document.head.append(s);
  });
  return gsiLoading;
}

export function isSignedIn() {
  return Boolean(token && token.expiresAt > Date.now() + 30_000);
}

/**
 * Vyžádá přístupový token. Otevře Google přihlašovací okno (vyžaduje kliknutí
 * uživatele, jinak ho prohlížeč zablokuje). Token platí zhruba hodinu.
 */
export async function signIn(clientId) {
  if (!clientId) throw new Error('Chybí Google client ID. Vyplňte ho v nastavení Google.');
  await loadGsi();

  if (!tokenClient || tokenClientId !== clientId) {
    tokenClientId = clientId;
    tokenClient = null;
  }

  return new Promise((resolve, reject) => {
    tokenClient = globalThis.google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: SCOPE,
      callback: (resp) => {
        if (resp.error) {
          reject(new Error(describeAuthError(resp.error)));
          return;
        }
        token = { accessToken: resp.access_token, expiresAt: Date.now() + Number(resp.expires_in || 3600) * 1000 };
        resolve(token);
      },
      error_callback: (err) => reject(new Error(describeAuthError(err?.type || err?.message))),
    });
    // prompt: '' → Google zobrazí výběr účtu jen napoprvé, pak přihlásí tiše.
    tokenClient.requestAccessToken({ prompt: token ? '' : 'select_account' });
  });
}

export function signOut() {
  const t = token;
  token = null;
  if (t && globalThis.google?.accounts?.oauth2) {
    try { globalThis.google.accounts.oauth2.revoke(t.accessToken, () => {}); } catch { /* nevadí */ }
  }
}

function describeAuthError(code) {
  switch (code) {
    case 'popup_closed':
    case 'popup_closed_by_user':
      return 'Přihlašovací okno bylo zavřeno.';
    case 'access_denied':
      return 'Přístup ke kalendáři nebyl povolen.';
    case 'popup_failed_to_open':
      return 'Prohlížeč zablokoval přihlašovací okno. Povolte vyskakovací okna pro tuto stránku.';
    case 'invalid_client':
      return 'Neplatné client ID. Zkontrolujte nastavení v Google Cloud Console.';
    default:
      return `Přihlášení se nezdařilo (${code || 'neznámá chyba'}).`;
  }
}

async function apiGet(path, params = {}) {
  if (!isSignedIn()) throw new Error('Nejste přihlášeni ke Google, nebo přihlášení vypršelo.');
  const url = new URL(`${API}${path}`);
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== '') url.searchParams.set(k, String(v));
  }
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token.accessToken}` } });
  if (res.status === 401) {
    token = null;
    throw new Error('Přihlášení ke Google vypršelo. Přihlaste se znovu.');
  }
  if (!res.ok) {
    let detail = '';
    try { detail = (await res.json()).error?.message || ''; } catch { /* bez detailu */ }
    throw new Error(`Google Calendar API odpovědělo chybou ${res.status}${detail ? `: ${detail}` : ''}.`);
  }
  return res.json();
}

/** Seznam kalendářů přihlášeného účtu: [{ id, summary, primary }]. */
export async function listCalendars() {
  const items = [];
  let pageToken;
  do {
    const page = await apiGet('/users/me/calendarList', { pageToken, minAccessRole: 'reader', maxResults: 250 });
    for (const c of page.items || []) {
      items.push({ id: c.id, summary: c.summaryOverride || c.summary || c.id, primary: Boolean(c.primary) });
    }
    pageToken = page.nextPageToken;
  } while (pageToken);
  items.sort((a, b) => Number(b.primary) - Number(a.primary) || a.summary.localeCompare(b.summary, 'cs'));
  return items;
}

/**
 * Události z kalendáře v zadaném rozmezí. Opakující se události se rozepíší
 * na jednotlivé výskyty (singleEvents), řazeno podle začátku.
 * @param {string} calendarId
 * @param {{ timeMin: Date, timeMax: Date }} range
 */
export async function listEvents(calendarId, { timeMin, timeMax }) {
  const items = [];
  let pageToken;
  do {
    const page = await apiGet(`/calendars/${encodeURIComponent(calendarId)}/events`, {
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      singleEvents: 'true',
      orderBy: 'startTime',
      showDeleted: 'false',
      maxResults: 250,
      pageToken,
      fields: 'nextPageToken,items(id,status,summary,description,location,start,end)',
    });
    items.push(...(page.items || []));
    pageToken = page.nextPageToken;
  } while (pageToken);
  return items;
}
