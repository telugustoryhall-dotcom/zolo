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
    const publicPath = path.resolve(__dirname, 'public');
    const indexPath = path.join(distPath, 'index.html');

    if (!fs.existsSync(indexPath)) {
      throw new Error(`Production frontend build not found at ${indexPath}. Run npm run build before starting.`);
    }

    if (fs.existsSync(publicPath)) {
      app.use(express.static(publicPath, { maxAge: '7d' }));
    }

    app.use(express.static(distPath, { index: false }));
    app.get('*', (req: Request, res: Response) => {
      if (req.path.startsWith('/api/')) {
        res.status(404).json({ error: 'API endpoint not found.' });
        return;
      }
      res.sendFile(indexPath);
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
