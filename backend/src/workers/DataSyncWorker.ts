import { Job } from 'bullmq';
import { DataSyncService } from '../services/DataSyncService';
import { AgreementService } from '../services/AgreementService';
import { logger } from '../utils/logger';

export async function processDataSyncJob(job: Job) {
  const { agreementId } = job.data;
  logger.info(`Processing data sync job for agreement ${agreementId}`);

  try {
    const dataSyncService = new DataSyncService(job.queue.client);
    const agreementService = new AgreementService(
      dataSyncService,
      job.queue.client,
      job.queue.client
    );

    // Check agreement thresholds and update values
    const thresholdBreached = await agreementService.checkAgreementThresholds(agreementId);

    return {
      success: true,
      thresholdBreached,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    logger.error('Error processing data sync job:', error);
    throw error;
  }
} 