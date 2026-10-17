import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import productRoutes from './routes/product.routes.js';
import recommendationsRouter from './routes/recommendations.js';
import authRouter from './routes/auth.js';
import ordersRouter from './routes/Order.js';
import transactionsRouter from './routes/Transcation.js';
import adminRouter from './routes/admin.js';
import analyticsRouter from './routes/analytics.js';
import notificationsRouter from './routes/notifications.js';
import copilotRouter from './routes/copilot.js';
import requestsRouter from './routes/requests.js';
import documentsRouter from './routes/documents.js';
import subscriptionsRouter from './routes/subscriptions.js';
import paypalWebhookRouter from './Service/paypalWebhook.js';
import { requireAuth } from './middleware/requireAuth.js';
import { requireRole } from './middleware/requireRole.js';
import { recommendationLimiter, procurementLimiter } from './middleware/authlimiter.js';
import { isAllowedOrigin } from './middleware/requireAllowedOrigin.js';

const app = express();

app.set('trust proxy', 1);
app.use(helmet());
app.use(cors({
  origin: (origin, callback) => callback(null, isAllowedOrigin(origin)),
  credentials: true,
}));

app.get('/api/health', (_req, res) => {
  res.json({ success: true, message: 'PayPilot AI API is running', status: 'ok' });
});

app.use('/api/webhooks/paypal', express.raw({ type: 'application/json', limit: '1mb' }), paypalWebhookRouter);
app.use(express.json({ limit: '100kb' }));
app.use(cookieParser());
app.use((req, res, next) => {
  const startedAt = Date.now();
  res.once('finish', () => {
    console.info(JSON.stringify({
      event: 'http.request',
      method: req.method,
      path: req.path,
      status: res.statusCode,
      durationMs: Date.now() - startedAt,
    }));
  });
  next();
});

app.use('/api/auth', authRouter);
app.use('/api/products', requireAuth, productRoutes);
app.use('/api/recommendations', requireAuth, recommendationLimiter, recommendationsRouter);
app.use('/api/orders', requireAuth, ordersRouter);
app.use('/api/requests', requireAuth, procurementLimiter, requestsRouter);
app.use('/api/documents', requireAuth, procurementLimiter, documentsRouter);
app.use('/api/subscriptions', requireAuth, subscriptionsRouter);
app.use('/api/transactions', requireAuth, transactionsRouter);
app.use('/api/analytics', requireAuth, analyticsRouter);
app.use('/api/notifications', requireAuth, notificationsRouter);
app.use('/api/copilot', requireAuth, recommendationLimiter, copilotRouter);
app.use('/api/admin', requireAuth, procurementLimiter, requireRole('admin'), adminRouter);

app.use((error, _req, res, next) => {
  if (res.headersSent) return next(error);
  const status = Number.isInteger(error.status) && error.status >= 400 && error.status < 500
    ? error.status : 500;
  if (status >= 500) console.error('[api] request failed:', error.message);
  res.status(status).json({
    error: status >= 500 ? 'The server could not complete this request.' : error.message,
  });
});

export default app;
