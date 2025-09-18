/**
 * Edge Server (API Gateway) — Auth + Game (stable stream)
 */
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import jwt from 'jsonwebtoken';
import { createProxyMiddleware as proxy } from 'http-proxy-middleware';
import { rateLimit } from 'express-rate-limit';

const PORT = Number(process.env.PORT || 8080);
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const CORS_ORIGIN = (process.env.CORS_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL || 'http://127.0.0.1:7001';
const GAME_SERVICE_URL = process.env.GAME_SERVICE_URL || 'http://127.0.0.1:7002';

const app = express();
app.set('trust proxy', 1);

app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(cors({ origin: CORS_ORIGIN, credentials: true }));
app.use(morgan('dev'));
app.use(rateLimit({ windowMs: 60_000, max: 300 }));


// ---- utils ----
function requireJWT(req, res, next) {
  const hdr = req.header('Authorization') || '';
  const token = hdr.startsWith('Bearer ') ? hdr.slice(7) : null;
  if (!token) return res.status(401).json({ ok: false, error: 'missing_token' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ ok: false, error: 'invalid_token' });
  }
}

const commonProxy = {
  changeOrigin: true,
  proxyTimeout: 15_000,
  timeout: 15_000,
  xfwd: true,
  logLevel: 'debug', // אפשר להחליף ל-'silent' כשמסיימים לדבג
  onError(err, req, res) {
    if (!res.headersSent) {
      res.status(502).json({ ok: false, error: 'upstream_error', detail: err?.message });
    }
  },
};

// ---- health ----
app.get('/health', (req, res) => res.json({ ok: true, service: 'edge' }));

// ---- proxies (לפני body parsing!) ----
app.use('/auth', proxy({
  target: AUTH_SERVICE_URL,
  pathRewrite: { '^/auth': '/' },
  ...commonProxy,
}));

app.use('/game', requireJWT, proxy({
  target: GAME_SERVICE_URL,
  pathRewrite: { '^/game': '/' },
  ...commonProxy,
}));

// עכשיו מותר לשים JSON parser עבור ראוטים שה-Edge מטפל בהם בעצמו (אין כאלה כרגע)
app.use(express.json({ limit: '1mb' }));

// ---- 404 ----
app.use((req, res) => res.status(404).json({ ok: false, error: 'not_found' }));

app.listen(PORT, () => {
  console.log(`[edge] listening on http://localhost:${PORT}`);
  console.log(`[edge] auth → ${AUTH_SERVICE_URL}`);
  console.log(`[edge] game → ${GAME_SERVICE_URL}`);
});
