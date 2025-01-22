import express from 'express';
import { DocuSignService } from '../services/DocuSignService';
import { PaymentService } from '../services/PaymentService';
import { AgreementService } from '../services/AgreementService';
import { Queue } from 'bullmq';
import { logger } from '../utils/logger';
import { Redis } from 'ioredis';

const router = express.Router();

// Initialize services
const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
});

const docusignService = new DocuSignService(redis);
const paymentService = new PaymentService();
const agreementService = new AgreementService(
  redis,
  new Queue('docusign-envelope', { connection: redis }),
  new Queue('notification', { connection: redis })
);

// DocuSign webhook handler
router.post('/docusign', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const signature = req.headers['x-docusign-signature-1'] as string;
    const payload = req.body.toString();

    // Validate webhook signature
    const isValid = await docusignService.validateWebhookSignature(signature, payload);
    if (!isValid) {
      logger.warn('Invalid DocuSign webhook signature');
      return res.status(401).json({ error: 'Invalid signature' });
    }

    const data = JSON.parse(payload);
    const envelopeId = data.envelopeId;
    
    // Handle different DocuSign events
    switch (data.event) {
      case 'envelope-signed':
        // Get envelope status
        const status = await docusignService.getEnvelopeStatus(envelopeId);
        
        // If all signers have signed
        if (status.status === 'completed') {
          // Download signed document
          const signedDoc = await docusignService.downloadSignedDocument(envelopeId);
          
          // Update agreement status
          const agreement = await agreementService.updateAgreement(data.agreementId, {
            status: 'signed',
            metadata: {
              ...data.metadata,
              signedAt: new Date().toISOString(),
            },
          });

          // Queue notification
          await new Queue('notification', { connection: redis }).add(
            'envelope-signed',
            {
              type: 'envelope-signed',
              agreementId: data.agreementId,
            }
          );
        }
        break;

      case 'envelope-declined':
        await agreementService.updateAgreement(data.agreementId, {
          status: 'voided',
          metadata: {
            ...data.metadata,
            declinedAt: new Date().toISOString(),
            declinedBy: data.recipientEmail,
            declineReason: data.declineReason,
          },
        });
        break;

      case 'envelope-voided':
        await agreementService.updateAgreement(data.agreementId, {
          status: 'voided',
          metadata: {
            ...data.metadata,
            voidedAt: new Date().toISOString(),
            voidedBy: data.senderEmail,
            voidReason: data.voidReason,
          },
        });
        break;
    }

    res.json({ received: true });
  } catch (error) {
    logger.error('Error processing DocuSign webhook:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Stripe webhook handler
router.post('/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const signature = req.headers['stripe-signature'] as string;
    
    const result = await paymentService.handleWebhookEvent(
      req.body,
      signature
    );

    res.json(result);
  } catch (error) {
    logger.error('Error processing Stripe webhook:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router; 