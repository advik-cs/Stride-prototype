import 'dotenv/config';

// Ensure default fallback environment variables for Prisma and JWT
if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = 'file:./dev.db';
}
if (!process.env.JWT_SECRET) {
  process.env.JWT_SECRET = 'stride-hackathon-secure-jwt-secret-key-2026';
}

import path from 'path';
import { createServer as createViteServer } from 'vite';
import createApp from './src/server/app.ts';

async function startServer() {
  const app = createApp();
  const PORT = 3000;

  // Vite middleware for development or static serving for production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(expressStatic(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`STRIDE Server running on http://localhost:${PORT}`);
    console.log(`Gemini API: ${process.env.GEMINI_API_KEY ? 'CONFIGURED (Active)' : 'NOT CONFIGURED (Limited Emergency Signal Extractor Active)'}`);
  });
}

function expressStatic(root: string) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const express = require('express');
  return express.static(root);
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
