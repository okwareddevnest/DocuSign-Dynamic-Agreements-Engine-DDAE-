import { Queue, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { logger } from '../utils/logger';
import { processDataSyncJob } from '../workers/DataSyncWorker';
import { processDocuSignJob } from '../workers/DocuSignWorker';
import { processNotificationJob } from '../workers/NotificationWorker';

// Queue names
export const QUEUE_NAMES = {
  DATA_SYNC: 'data-sync',
  AGREEMENT_UPDATE: 'agreement-update',
  DOCUSIGN_ENVELOPE: 'docusign-envelope',
  NOTIFICATION: 'notification',
} as const;

// Queue configurations
const queueConfigs = {
  [QUEUE_NAMES.DATA_SYNC]: {
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 1000,
      },
      repeat: {
        every: 5 * 60 * 1000, // 5 minutes
      },
    },
  },
  [QUEUE_NAMES.AGREEMENT_UPDATE]: {
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 1000,
      },
    },
  },
  [QUEUE_NAMES.DOCUSIGN_ENVELOPE]: {
    defaultJobOptions: {
      attempts: 5,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
    },
  },
  [QUEUE_NAMES.NOTIFICATION]: {
    defaultJobOptions: {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 1000,
      },
    },
  },
};

export async function setupQueues(redisClient: Redis) {
  const queues: Queue[] = [];

  try {
    // Create queues
    for (const [name, config] of Object.entries(queueConfigs)) {
      const queue = new Queue(name, {
        connection: redisClient,
        defaultJobOptions: config.defaultJobOptions,
      });
      queues.push(queue);
      logger.info(`Queue created: ${name}`);
    }

    // Setup workers
    setupWorkers(redisClient);

    return queues;
  } catch (error) {
    logger.error('Error setting up queues:', error);
    throw error;
  }
}

function setupWorkers(redisClient: Redis) {
  // Data Sync Worker
  new Worker(
    QUEUE_NAMES.DATA_SYNC,
    processDataSyncJob,
    { 
      connection: redisClient,
      concurrency: 5,
    }
  );

  // Agreement Update Worker (uses same processor as Data Sync)
  new Worker(
    QUEUE_NAMES.AGREEMENT_UPDATE,
    processDataSyncJob,
    { 
      connection: redisClient,
      concurrency: 3,
    }
  );

  // DocuSign Envelope Worker
  new Worker(
    QUEUE_NAMES.DOCUSIGN_ENVELOPE,
    processDocuSignJob,
    { 
      connection: redisClient,
      concurrency: 2,
    }
  );

  // Notification Worker
  new Worker(
    QUEUE_NAMES.NOTIFICATION,
    processNotificationJob,
    { 
      connection: redisClient,
      concurrency: 5,
    }
  );

  logger.info('Workers initialized successfully');
} 