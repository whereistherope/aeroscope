// Adds the public Supabase client credentials only to AeroScope API relay requests.
// The anon key is intentionally browser-safe; provider/server secrets never live in the frontend.
(() => {
  const nativeFetch = window.fetch.bind(window);

  window.fetch = (input, init = {}) => {
    const requestUrl = typeof input === 'string' ? input : input?.url || '';
    const apiBase = String(window.AEROSCOPE_CONFIG?.apiBase || '').replace(/\/$/, '');
    const anonKey = String(window.AEROSCOPE_CONFIG?.supabaseAnonKey || '');

    if (!apiBase || !anonKey || !String(requestUrl).startsWith(apiBase)) {
      return nativeFetch(input, init);
    }

    const headers = new Headers(init.headers || (typeof input !== 'string' ? input.headers : undefined));
    if (!headers.has('authorization')) headers.set('authorization', `Bearer ${anonKey}`);
    if (!headers.has('apikey')) headers.set('apikey', anonKey);
    if (!headers.has('accept')) headers.set('accept', 'application/json');

    return nativeFetch(input, { ...init, headers });
  };
})();
