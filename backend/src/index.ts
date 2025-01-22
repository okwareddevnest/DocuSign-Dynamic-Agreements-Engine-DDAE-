import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { setupBullBoard } from '@bull-board/express';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { createBullBoard } from '@bull-board/api';
import { ExpressAdapter } from '@bull-board/express';

import { setupDatabase } from './config/database';
import { setupRedis } from './config/redis';
import { setupMinio } from './config/minio';
import { setupQueues } from './config/queues';
import { errorHandler } from './middleware/errorHandler';
import { logger } from './utils/logger';

// Load environment variables
const PORT = process.env.API_PORT || 3000;

async function bootstrap() {
  try {
    // Initialize Express app
    const app = express();
    const httpServer = createServer(app);
    const io = new Server(httpServer, {
      cors: {
        origin: process.env.FRONTEND_URL || 'http://localhost:3000',
        methods: ['GET', 'POST'],
      },
    });

    // Middleware
    app.use(cors());
    app.use(express.json());

    // Initialize services
    await setupDatabase();
    const redis = await setupRedis();
    await setupMinio();
    const queues = await setupQueues(redis);

    // Setup Bull Board
    const serverAdapter = new ExpressAdapter();
    const { addQueue, removeQueue, setQueues, replaceQueues } = createBullBoard({
      queues: queues.map(queue => new BullMQAdapter(queue)),
      serverAdapter: serverAdapter,
    });
    
    setupBullBoard({ queues, serverAdapter });
    app.use('/admin/queues', serverAdapter.getRouter());

    // Socket.IO connection handler
    io.on('connection', (socket) => {
      logger.info(`Client connected: ${socket.id}`);
      
      socket.on('disconnect', () => {
        logger.info(`Client disconnected: ${socket.id}`);
      });
    });

    // API Routes
    app.use('/api/v1/agreements', require('./routes/agreements'));
    app.use('/api/v1/templates', require('./routes/templates'));
    app.use('/api/v1/webhooks', require('./routes/webhooks'));

    // Error handling
    app.use(errorHandler);

    // Start server
    httpServer.listen(PORT, () => {
      logger.info(`Server running on port ${PORT}`);
    });

  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

bootstrap(); 