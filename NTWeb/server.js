/**
 * NeuralTrade Web - Node.js server.
 * Serves React static build and proxies /api/* to the Python backend (backend_api.py).
 */

const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const BACKEND_URL = (process.env.BACKEND_URL || 'http://127.0.0.1:5001').replace(/\/$/, '');

app.use(express.json());

/** Stream SSE endpoint (do not buffer). */
app.get('/api/scan_stream', async (req, res, next) => {
  const url = `${BACKEND_URL}/scan_stream?${new URLSearchParams(req.query)}`;
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { ...req.headers, host: undefined, accept: 'text/event-stream' },
    });

    res.status(response.status);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');

    if (!response.body) return res.end();
    response.body.pipe(res);
  } catch (err) {
    next(err);
  }
});

/** Proxy /api/* to Python backend (e.g. /api/status -> /status, /api/scan -> /scan) */
app.use('/api', async (req, res, next) => {
  const backendPath = req.url || '/';
  const url = `${BACKEND_URL}${backendPath}`;
  try {
    const headers = { ...req.headers, host: undefined };
    const options = { method: req.method, headers };
    if (req.method !== 'GET' && req.method !== 'HEAD' && req.body !== undefined) {
      options.body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    }
    const response = await fetch(url, options);
    const contentType = response.headers.get('content-type');
    const data = contentType && contentType.includes('json') ? await response.json().catch(() => ({})) : await response.text();
    res.status(response.status);
    if (contentType) res.setHeader('Content-Type', contentType);
    res.send(data);
  } catch (err) {
    next(err);
  }
});

/** Serve React build when present */
const distDir = path.join(__dirname, 'dist');
app.use(express.static(distDir));

/** SPA fallback: serve index.html for non-API routes */
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  const indexFile = path.join(distDir, 'index.html');
  const fs = require('fs');
  if (fs.existsSync(indexFile)) {
    res.sendFile(indexFile);
  } else {
    res.status(500).send('Build not found. Run: npm run build');
  }
});

app.use((err, req, res, next) => {
  console.error(err);
  const status = err.status || 500;
  res.status(status).send(
    status === 500
      ? 'Backend unavailable. Start the Python API: python backend_api.py'
      : err.message
  );
});

app.listen(PORT, () => {
  console.log(`NeuralTrade Web at http://localhost:${PORT}`);
  console.log(`Python backend expected at ${BACKEND_URL}`);
});
