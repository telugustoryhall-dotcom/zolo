import 'dotenv/config';
import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import express, { type Request, type Response } from 'express';
import { createApp } from './src/server/app.ts';
import { attachRealtimeHub } from './src/server/realtimeHub.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = createApp();
  const httpServer = http.createServer(app);
  attachRealtimeHub(httpServer);

  const port = Number(process.env.PORT) || 3000;
  const isProduction = process.env.NODE_ENV === 'production';

  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');

    if (!fs.existsSync(distPath)) {
      throw new Error(`Production build directory not found: ${distPath}`);
    }

    app.use(express.static(distPath, { index: false, maxAge: '7d' }));
    app.get('*', (req: Request, res: Response) => {
      if (req.path.startsWith('/api/')) {
        res.status(404).json({ error: 'API endpoint not found.' });
        return;
      }
      if (
        path.extname(req.path) ||
        req.path.startsWith('/icons/') ||
        req.path.startsWith('/assets/')
      ) {
        res.sendStatus(404);
        return;
      }
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(port, '0.0.0.0', () => {
    console.log(
      `ZOLO server & WebSocket hub listening on http://0.0.0.0:${port} (${
        isProduction ? 'production' : 'development'
      })`
    );
  });
}

startServer().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});
