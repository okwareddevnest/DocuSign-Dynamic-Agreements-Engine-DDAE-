import { Job } from 'bullmq';
import { Agreement } from '../models/Agreement';
import { Template } from '../models/Template';
import { AuditLog } from '../models/AuditLog';
import { logger } from '../utils/logger';
import docusign from 'docusign-esign';

export async function processDocuSignJob(job: Job) {
  const { agreementId } = job.data;
  logger.info(`Processing DocuSign job for agreement ${agreementId}`);

  try {
    // Get agreement with template
    const agreement = await Agreement.findByPk(agreementId, {
      include: [{ model: Template, as: 'template' }],
    });

    if (!agreement || !agreement.template) {
      throw new Error('Agreement or template not found');
    }

    // Initialize DocuSign API client
    const apiClient = new docusign.ApiClient();
    apiClient.setBasePath('https://demo.docusign.net/restapi');
    
    // TODO: Implement JWT authentication
    const accessToken = process.env.DOCUSIGN_ACCESS_TOKEN;
    apiClient.addDefaultHeader('Authorization', `Bearer ${accessToken}`);

    // Create envelope definition
    const envelopeDef = new docusign.EnvelopeDefinition();
    envelopeDef.templateId = agreement.template.docusignTemplateId;
    
    // Set template roles
    const templateRoles = agreement.signers.map(signer => ({
      email: signer.email,
      name: signer.name,
      roleName: signer.role,
      tabs: {
        textTabs: Object.entries(agreement.currentValues).map(([key, value]) => ({
          tabLabel: key,
          value: String(value),
        })),
      },
    }));

    envelopeDef.templateRoles = templateRoles;
    envelopeDef.status = 'sent';

    // Create envelope
    const envelopesApi = new docusign.EnvelopesApi(apiClient);
    const results = await envelopesApi.createEnvelope(
      process.env.DOCUSIGN_ACCOUNT_ID!,
      { envelopeDefinition: envelopeDef }
    );

    // Update agreement with envelope ID
    const oldValues = agreement.toJSON();
    agreement.docusignEnvelopeId = results.envelopeId;
    agreement.status = 'sent';
    await agreement.save();

    // Log the update
    await AuditLog.create({
      entityType: 'agreement',
      entityId: agreement.id,
      action: 'send',
      changes: {
        before: oldValues,
        after: agreement.toJSON(),
      },
      metadata: {
        envelopeId: results.envelopeId,
      },
    });

    return {
      success: true,
      envelopeId: results.envelopeId,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    logger.error('Error processing DocuSign job:', error);
    throw error;
  }
} 