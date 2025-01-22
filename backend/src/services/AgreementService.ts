import { Agreement } from '../models/Agreement';
import { Template } from '../models/Template';
import { AuditLog } from '../models/AuditLog';
import { DataSyncService } from './DataSyncService';
import { Queue } from 'bullmq';
import { logger } from '../utils/logger';
import { AppError } from '../middleware/errorHandler';
import { get } from 'lodash';

export class AgreementService {
  private dataSyncService: DataSyncService;
  private docusignQueue: Queue;
  private notificationQueue: Queue;

  constructor(
    dataSyncService: DataSyncService,
    docusignQueue: Queue,
    notificationQueue: Queue
  ) {
    this.dataSyncService = dataSyncService;
    this.docusignQueue = docusignQueue;
    this.notificationQueue = notificationQueue;
  }

  async createAgreement(templateId: string, signers: any[]): Promise<Agreement> {
    const template = await Template.findByPk(templateId);
    if (!template) {
      throw new AppError(404, 'Template not found');
    }

    const agreement = await Agreement.create({
      templateId,
      signers,
      status: 'draft',
      currentValues: {},
    });

    await AuditLog.create({
      entityType: 'agreement',
      entityId: agreement.id,
      action: 'create',
      changes: {
        after: agreement.toJSON(),
      },
    });

    return agreement;
  }

  async checkAgreementThresholds(agreementId: string): Promise<boolean> {
    const agreement = await Agreement.findByPk(agreementId, {
      include: [{ model: Template, as: 'template' }],
    });

    if (!agreement || !agreement.template) {
      throw new AppError(404, 'Agreement or template not found');
    }

    let thresholdBreached = false;
    const updates: Record<string, any> = {};

    // Check each dynamic field
    for (const [field, config] of Object.entries(agreement.template.dynamicFields)) {
      try {
        const data = await this.dataSyncService.getData(config.type, config.source);
        const currentValue = get(data, config.path);
        
        // Update current value
        updates[field] = currentValue;

        // Check threshold if configured
        if (config.threshold && config.operator) {
          const threshold = config.threshold;
          const breached = this.evaluateThreshold(currentValue, threshold, config.operator);
          
          if (breached) {
            thresholdBreached = true;
            logger.info(`Threshold breached for agreement ${agreementId}, field ${field}`);
            
            // Queue notifications
            await this.notificationQueue.add('threshold-breach', {
              agreementId,
              field,
              currentValue,
              threshold,
              operator: config.operator,
            });
          }
        }
      } catch (error) {
        logger.error(`Error checking field ${field}:`, error);
      }
    }

    // Update agreement with new values
    if (Object.keys(updates).length > 0) {
      const oldValues = { ...agreement.currentValues };
      agreement.currentValues = { ...agreement.currentValues, ...updates };
      agreement.lastChecked = new Date();
      await agreement.save();

      // Log the update
      await AuditLog.create({
        entityType: 'agreement',
        entityId: agreement.id,
        action: 'update',
        changes: {
          before: oldValues,
          after: agreement.currentValues,
        },
      });
    }

    return thresholdBreached;
  }

  private evaluateThreshold(
    value: number,
    threshold: number,
    operator: '>' | '<' | '==' | '>=' | '<='
  ): boolean {
    switch (operator) {
      case '>':
        return value > threshold;
      case '<':
        return value < threshold;
      case '==':
        return value === threshold;
      case '>=':
        return value >= threshold;
      case '<=':
        return value <= threshold;
      default:
        return false;
    }
  }

  async updateAgreement(agreementId: string, updates: Partial<Agreement>): Promise<Agreement> {
    const agreement = await Agreement.findByPk(agreementId);
    if (!agreement) {
      throw new AppError(404, 'Agreement not found');
    }

    const oldValues = agreement.toJSON();
    await agreement.update(updates);

    await AuditLog.create({
      entityType: 'agreement',
      entityId: agreement.id,
      action: 'update',
      changes: {
        before: oldValues,
        after: agreement.toJSON(),
      },
    });

    return agreement;
  }

  async getAgreement(agreementId: string): Promise<Agreement> {
    const agreement = await Agreement.findByPk(agreementId, {
      include: [{ model: Template, as: 'template' }],
    });

    if (!agreement) {
      throw new AppError(404, 'Agreement not found');
    }

    return agreement;
  }

  async listAgreements(filters: {
    status?: string;
    templateId?: string;
  } = {}): Promise<Agreement[]> {
    return Agreement.findAll({
      where: filters,
      include: [{ model: Template, as: 'template' }],
      order: [['createdAt', 'DESC']],
    });
  }
} 