/**
 * API client for NeuralTrade backend.
 * In dev, Vite proxies /api to the Python backend. In production, Express serves build and proxies /api.
 */

const getBaseUrl = () => {
  if (import.meta.env.DEV) return '';
  return '';
};

async function request(path, options = {}) {
  const base = getBaseUrl();
  const url = path.startsWith('/') ? `${base}${path}` : `${base}/${path}`;
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  });
  if (!res.ok) {
    const err = new Error(`API ${res.status}: ${path}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

/** Check if backend analysis modules are loaded. Used to gate the main UI. */
export async function getStatus() {
  return request('/api/status');
}

export async function getNews() {
  return request('/api/news');
}

export async function getChart(ticker, period = '3mo') {
  const params = new URLSearchParams({ ticker, period });
  return request(`/api/chart?${params}`);
}

export async function scan(company) {
  return request('/api/scan', {
    method: 'POST',
    body: JSON.stringify({ company: company.trim() }),
  });
}

/**
 * Streaming scan using SSE.
 * Emits:
 *  - { type: 'phase', phase, status }
 *  - { type: 'still', phase, message }
 *  - { type: 'insight_delta', text }
 *  - { type: 'insight_replace', insight }
 *  - { type: 'snapshot', data } — charts/sentiment/technicals before insight finishes streaming
 *  - { type: 'error', message }
 *  - { type: 'result', data }
 */
export function scanStream(company, { onEvent, onError } = {}) {
  const q = (company || '').trim()
  const params = new URLSearchParams({ company: q })
  const es = new EventSource(`/api/scan_stream?${params}`)

  const emit = (evt) => {
    try {
      onEvent?.(evt)
    } catch (_) {}
  }

  es.addEventListener('phase', (e) => {
    try {
      const data = JSON.parse(e.data)
      emit({ type: 'phase', ...data })
    } catch (_) {}
  })

  es.addEventListener('still', (e) => {
    try {
      const data = JSON.parse(e.data)
      emit({ type: 'still', ...data })
    } catch (_) {}
  })

  es.addEventListener('insight_delta', (e) => {
    try {
      const data = JSON.parse(e.data)
      emit({ type: 'insight_delta', ...data })
    } catch (_) {}
  })

  es.addEventListener('insight_replace', (e) => {
    try {
      const data = JSON.parse(e.data)
      emit({ type: 'insight_replace', ...data })
    } catch (_) {}
  })

  es.addEventListener('snapshot', (e) => {
    try {
      const data = JSON.parse(e.data)
      emit({ type: 'snapshot', data })
    } catch (_) {}
  })

  es.addEventListener('error', (e) => {
    // EventSource 'error' is not always JSON; treat as transport error.
    onError?.(e)
  })

  es.addEventListener('result', (e) => {
    try {
      const data = JSON.parse(e.data)
      emit({ type: 'result', data })
    } catch (_) {}
    es.close()
  })

  return () => es.close()
}
