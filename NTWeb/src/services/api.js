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
