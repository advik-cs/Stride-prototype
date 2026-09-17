import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { errorHandler } from './middleware/errorHandler.ts';
import authRoutes from './routes/authRoutes.ts';
import householdRoutes from './routes/householdRoutes.ts';
import disasterRoutes from './routes/disasterRoutes.ts';
import shelterRoutes from './routes/shelterRoutes.ts';
import facilityRoutes from './routes/facilityRoutes.ts';
import mapRoutes from './routes/mapRoutes.ts';
import emergencyRoutes from './routes/emergencyRoutes.ts';
import notificationRoutes from './routes/notificationRoutes.ts';
import voiceRoutes from './routes/voiceRoutes.ts';
import prisma from './config/database.ts';

export function createApp() {
  const app = express();

  // Middleware
  app.use(cors());
  app.use(express.json());

  // Vercel serverless request path preservation
  app.use((req, _res, next) => {
    const queryRoute = req.query?.__route as string | undefined;
    if (queryRoute) {
      delete req.query.__route;
      const searchParams = new URLSearchParams();
      for (const [key, value] of Object.entries(req.query)) {
        if (typeof value === 'string') searchParams.set(key, value);
      }
      const qs = searchParams.toString();
      req.url = qs ? `${queryRoute}?${qs}` : queryRoute;
    } else {
      const candidate =
        (req.headers['x-matched-path'] as string) ||
        (req.headers['x-vercel-original-path'] as string) ||
        (req.headers['x-forwarded-uri'] as string) ||
        req.originalUrl;

      if (candidate && candidate.startsWith('/api') && req.url !== candidate) {
        req.url = candidate;
      }
    }
    next();
  });

  // Health check endpoint required by spec
  app.get(['/api/health', '/health'], async (req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      res.json({
        status: 'ok',
        service: 'STRIDE Disaster Intelligence Platform',
        version: '1.0.0-hackathon',
        database: 'connected',
        timestamp: new Date().toISOString(),
      });
    } catch (err: any) {
      res.status(500).json({
        status: 'error',
        message: err.message,
        timestamp: new Date().toISOString(),
      });
    }
  });

  // REST API Routes - mounted on both '/api' and root for Vercel serverless flexibility
  const mountRoutes = (prefix: string) => {
    app.use(`${prefix}/auth`, authRoutes);
    app.use(prefix, householdRoutes);
    app.use(prefix, disasterRoutes);
    app.use(prefix, shelterRoutes);
    app.use(prefix, facilityRoutes);
    app.use(prefix, mapRoutes);
    app.use(prefix, emergencyRoutes);
    app.use(prefix, notificationRoutes);
    app.use(prefix, voiceRoutes);
  };

  mountRoutes('/api');
  mountRoutes('');

  // Centralized Error Handling
  app.use(errorHandler);

  return app;
}

export default createApp;
