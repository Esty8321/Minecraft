// // edge/edge-server.js
// import 'dotenv/config';
// import express from 'express';
// import cors from 'cors';
// import { createProxyMiddleware as proxy } from 'http-proxy-middleware';
// import jwt from 'jsonwebtoken';

// // סביבה
// const PORT = Number(process.env.PORT || 8080);
// const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL || 'http://127.0.0.1:7001';
// const GAME_SERVICE_URL = process.env.GAME_SERVICE_URL || 'http://127.0.0.1:7002';
// const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:5173';
// const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';

// // שרת
// const app = express();

// // CORS
// app.use(cors({
//   origin: CORS_ORIGIN,
//   credentials: true,
// }));

// // בריאות
// app.get('/health', (_req, res) => res.json({ ok: true, edge: true }));

// // ----- אימות JWT -----
// // קורא טוקן מ-Authorization *או* מ-query ?token= *או* מ-subprotocol של WebSocket
// function requireJWT(req, res, next) {
//   let token = null;

//   // 1) Authorization: Bearer <JWT>
//   const hdr = req.header('Authorization') || '';
//   if (hdr.startsWith('Bearer ')) token = hdr.slice(7);

//   // 2) query param (גם ל-WS)
//   if (!token && req.query && typeof req.query.token === 'string') {
//     token = req.query.token;
//   }

//   // 3) WebSocket subprotocol: "jwt, <token>"
//   if (!token && req.headers['sec-websocket-protocol']) {
//     const parts = String(req.headers['sec-websocket-protocol'])
//       .split(',')
//       .map(s => s.trim());
//     if (parts.length >= 2) token = parts[1];
//   }

//   if (!token) return res.status(401).json({ ok: false, error: 'missing_token' });
//   try {
//     req.user = jwt.verify(token, JWT_SECRET);
//     return next();
//   } catch {
//     return res.status(401).json({ ok: false, error: 'invalid_token' });
//   }
// }

// // הגדרות פרוקסי נפוצות
// const commonProxy = {
//   changeOrigin: true,
//   xfwd: true,
//   logLevel: 'warn',
// };

// // ---- פרוקסי לשירות האימות (כולל WS) ----
// app.use('/auth', proxy({
//   target: AUTH_SERVICE_URL,
//   pathRewrite: { '^/auth': '/' },
//   ws: true,                // <<< חשוב ל-WS
//   ...commonProxy,
// }));

// // ---- פרוקסי למשחק (דורש JWT, כולל WS) ----
// app.use('/game', requireJWT, proxy({
//   target: GAME_SERVICE_URL,
//   pathRewrite: { '^/game': '/' },
//   ws: true,                // <<< חשוב ל-WS
//   ...commonProxy,
// }));

// // הפעלה
// const server = app.listen(PORT, () => {
//   console.log(`[edge] listening on http://127.0.0.1:${PORT}`);
// });

// // תמיכה ב-WS גם ברמת השרת (נדרש ע"י http-proxy-middleware)
// server.on('upgrade', (req, socket, head) => {
//   // middlewares של express לא רצים אוטומטית ב-upgrade; http-proxy-middleware ידאג לפרוקסי עצמו.
// });

/**
 * Edge Server (API Gateway) — Auth + Game (WS+HTTP)
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
function getTokenFromReq(req) {
  const hdr = req.header('Authorization') || '';
  if (hdr.startsWith('Bearer ')) return hdr.slice(7);
  // תמיכה ב־?token= עבור WebSocket מהדפדפן
  if (req.query && typeof req.query.token === 'string') return req.query.token;
  return null;
}

// function requireJWT(req, res, next) {
//   const token = getTokenFromReq(req);
//   if (!token) return res.status(401).json({ ok: false, error: 'missing_token' });
//   try {
//     req.user = jwt.verify(token, JWT_SECRET);
//     return next();
//   } catch {
//     return res.status(401).json({ ok: false, error: 'invalid_token' });
//   }
// }

function requireJWT(req, res, next) {
  const token = getTokenFromReq(req);
  if (!token) {
    console.log('[edge] missing token');
    return res.status(401).json({ ok:false, error:'missing_token' });
  }
  try {
    const payload = jwt.verify(token, JWT_SECRET, {algorithms: ['HS256']});
    // console.log('[edge] jwt ok', payload);
    req.user = payload;
    return next();
  } catch (e) {
    console.log('[edge] invalid jwt:', e?.message);
    return res.status(401).json({ ok:false, error:'invalid_token' });
  }
}


const commonProxy = {
  changeOrigin: true,
  proxyTimeout: 15_000,
  timeout: 15_000,
  xfwd: true,
  logLevel: 'debug',
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
  ws: true, // לא חובה כאן, אבל לא מזיק
}));

// חשוב: ws:true כדי לתמוך ב־WebSocket, + אימות JWT (כולל ?token=)
app.use('/game', requireJWT, proxy({
  target: GAME_SERVICE_URL,
  pathRewrite: { '^/game': '/' },
  ...commonProxy,
  ws: true, // ← זה היה חסר
}));

// מותר JSON parser רק לראוטים שה־Edge משרת בעצמו
app.use(express.json({ limit: '1mb' }));

// ---- 404 ----
app.use((req, res) => res.status(404).json({ ok: false, error: 'not_found' }));

app.listen(PORT, () => {
  console.log(`[edge] listening on http://localhost:${PORT}`);
  console.log(`[edge] auth → ${AUTH_SERVICE_URL}`);
  console.log(`[edge] game → ${GAME_SERVICE_URL}`);
});
