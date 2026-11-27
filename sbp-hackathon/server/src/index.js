/**
 * Servidor Principal - Plataforma Inteligente de Rankings y Análisis Bancario
 * Hackathon SBP 2026
 */

import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import apiRoutes from './routes/api.js';
import { getPeriodos } from './db/database.js';
import { runSeed } from './db/seed.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.PORT || 3001;
const app = express();

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// API routes
app.use('/api', apiRoutes);

// Serve built frontend if available (for single-command local production demo)
const clientDist = path.join(__dirname, '..', '..', 'client', 'dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('/{*path}', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

// Error handler
app.use((err, req, res, next) => {
  console.error('[Server Error]', err);
  res.status(err.status || 500).json({
    success: false,
    error: err.message || 'Error interno del servidor'
  });
});

async function bootstrap() {
  try {
    const existingPeriods = getPeriodos();
    if (existingPeriods.length === 0) {
      console.log('[Bootstrap] Base de datos vacía. Procesando automáticamente los 3 períodos oficiales...');
      const res = await runSeed();
      console.log(`[Bootstrap] Inicialización completada en ${res.processingTimeMs} ms (${res.periodos.join(', ')})`);
    } else {
      console.log(`[Bootstrap] Base de datos SQLite lista (${existingPeriods.length} períodos cargados).`);
    }

    app.listen(PORT, () => {
      console.log(`[Server] SBP Hackathon 2026 API ejecutándose en http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error('[Bootstrap Error]', err);
    process.exit(1);
  }
}

bootstrap();
