import express from 'express';
import { AgreementService } from '../services/AgreementService';
import { PaymentService } from '../services/PaymentService';
import { DocuSignService } from '../services/DocuSignService';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { AppError } from '../middleware/errorHandler';
import { logger } from '../utils/logger';

const router = express.Router();

// Initialize services
const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
});

const docusignQueue = new Queue('docusign-envelope', { connection: redis });
const notificationQueue = new Queue('notification', { connection: redis });

const agreementService = new AgreementService(
  new DataSyncService(redis),
  docusignQueue,
  notificationQueue
);
const paymentService = new PaymentService();
const docuSignService = new DocuSignService(redis);

// Create agreement
router.post('/', async (req, res, next) => {
  try {
    const { templateId, signers, paymentAmount } = req.body;

    // Create agreement
    const agreement = await agreementService.createAgreement(templateId, signers);

    // Create payment intent if payment is required
    if (paymentAmount) {
      const paymentIntent = await paymentService.createPaymentIntent(
        agreement.id,
        paymentAmount
      );

      // Add payment info to agreement metadata
      await agreementService.updateAgreement(agreement.id, {
        metadata: {
          ...agreement.metadata,
          paymentIntentId: paymentIntent.id,
          paymentAmount,
          paymentStatus: 'pending',
        },
      });

      return res.json({
        agreement,
        paymentIntent: {
          id: paymentIntent.id,
          clientSecret: paymentIntent.client_secret,
        },
      });
    }

    res.json({ agreement });
  } catch (error) {
    next(error);
  }
});

// Get agreement
router.get('/:id', async (req, res, next) => {
  try {
    const agreement = await agreementService.getAgreement(req.params.id);
    res.json(agreement);
  } catch (error) {
    next(error);
  }
});

// List agreements
router.get('/', async (req, res, next) => {
  try {
    const { status, templateId } = req.query;
    const agreements = await agreementService.listAgreements({
      status: status as string,
      templateId: templateId as string,
    });
    res.json(agreements);
  } catch (error) {
    next(error);
  }
});

// Send agreement for signing
router.post('/:id/send', async (req, res, next) => {
  try {
    const agreement = await agreementService.getAgreement(req.params.id);

    // Check if payment is required and completed
    if (agreement.metadata.paymentAmount && agreement.metadata.paymentStatus !== 'paid') {
      throw new AppError(400, 'Payment required before sending for signature');
    }

    // Create DocuSign envelope
    const { envelopeId } = await docuSignService.createEnvelope(
      agreement.template!.docusignTemplateId,
      agreement.signers.map(signer => ({
        email: signer.email,
        name: signer.name,
        role: signer.role,
        tabs: agreement.currentValues,
      }))
    );

    // Update agreement with envelope ID
    await agreementService.updateAgreement(agreement.id, {
      docusignEnvelopeId: envelopeId,
      status: 'sent',
      metadata: {
        ...agreement.metadata,
        sentAt: new Date().toISOString(),
      },
    });

    res.json({ envelopeId });
  } catch (error) {
    next(error);
  }
});

// Confirm payment
router.post('/:id/confirm-payment', async (req, res, next) => {
  try {
    const { paymentIntentId } = req.body;
    const agreement = await agreementService.getAgreement(req.params.id);

    if (agreement.metadata.paymentIntentId !== paymentIntentId) {
      throw new AppError(400, 'Invalid payment intent ID');
    }

    const paymentIntent = await paymentService.confirmPayment(paymentIntentId);

    res.json({
      status: paymentIntent.status,
      agreement: await agreementService.getAgreement(req.params.id),
    });
  } catch (error) {
    next(error);
  }
});

// Void agreement
router.post('/:id/void', async (req, res, next) => {
  try {
    const { reason } = req.body;
    const agreement = await agreementService.updateAgreement(req.params.id, {
      status: 'voided',
      metadata: {
        voidedAt: new Date().toISOString(),
        voidReason: reason,
      },
    });

    res.json(agreement);
  } catch (error) {
    next(error);
  }
});

export default router; 