import { Job } from 'bullmq';
import { Agreement } from '../models/Agreement';
import { Template } from '../models/Template';
import { logger } from '../utils/logger';
import twilio from 'twilio';
import sgMail from '@sendgrid/mail';

// Initialize clients
const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);
sgMail.setApiKey(process.env.SENDGRID_API_KEY!);

export async function processNotificationJob(job: Job) {
  const { type, agreementId, field, currentValue, threshold, operator } = job.data;
  logger.info(`Processing notification job for agreement ${agreementId}`);

  try {
    // Get agreement with template
    const agreement = await Agreement.findByPk(agreementId, {
      include: [{ model: Template, as: 'template' }],
    });

    if (!agreement || !agreement.template) {
      throw new Error('Agreement or template not found');
    }

    switch (type) {
      case 'threshold-breach':
        await sendThresholdBreachNotifications(
          agreement,
          field,
          currentValue,
          threshold,
          operator
        );
        break;

      case 'envelope-signed':
        await sendEnvelopeSignedNotifications(agreement);
        break;

      default:
        throw new Error(`Unknown notification type: ${type}`);
    }

    return {
      success: true,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    logger.error('Error processing notification job:', error);
    throw error;
  }
}

async function sendThresholdBreachNotifications(
  agreement: Agreement,
  field: string,
  currentValue: any,
  threshold: number,
  operator: string
) {
  const message = `
    Threshold breach detected for agreement ${agreement.id}:
    Field: ${field}
    Current Value: ${currentValue}
    Threshold: ${operator} ${threshold}
  `;

  // Send SMS notifications
  for (const signer of agreement.signers) {
    if (signer.phone) {
      try {
        await twilioClient.messages.create({
          body: message,
          to: signer.phone,
          from: process.env.TWILIO_PHONE_NUMBER,
        });
        logger.info(`SMS sent to ${signer.phone}`);
      } catch (error) {
        logger.error(`Error sending SMS to ${signer.phone}:`, error);
      }
    }

    // Send email notifications
    try {
      await sgMail.send({
        to: signer.email,
        from: process.env.SENDGRID_FROM_EMAIL!,
        subject: 'Agreement Threshold Breach Alert',
        text: message,
        html: `
          <h2>Agreement Threshold Breach Alert</h2>
          <p>A threshold breach has been detected for your agreement:</p>
          <ul>
            <li><strong>Agreement ID:</strong> ${agreement.id}</li>
            <li><strong>Field:</strong> ${field}</li>
            <li><strong>Current Value:</strong> ${currentValue}</li>
            <li><strong>Threshold:</strong> ${operator} ${threshold}</li>
          </ul>
          <p>Please review your agreement for necessary actions.</p>
        `,
      });
      logger.info(`Email sent to ${signer.email}`);
    } catch (error) {
      logger.error(`Error sending email to ${signer.email}:`, error);
    }
  }
}

async function sendEnvelopeSignedNotifications(agreement: Agreement) {
  const message = `Agreement ${agreement.id} has been signed by all parties.`;

  // Send notifications to all signers
  for (const signer of agreement.signers) {
    if (signer.phone) {
      try {
        await twilioClient.messages.create({
          body: message,
          to: signer.phone,
          from: process.env.TWILIO_PHONE_NUMBER,
        });
        logger.info(`SMS sent to ${signer.phone}`);
      } catch (error) {
        logger.error(`Error sending SMS to ${signer.phone}:`, error);
      }
    }

    try {
      await sgMail.send({
        to: signer.email,
        from: process.env.SENDGRID_FROM_EMAIL!,
        subject: 'Agreement Signing Complete',
        text: message,
        html: `
          <h2>Agreement Signing Complete</h2>
          <p>Your agreement (ID: ${agreement.id}) has been signed by all parties.</p>
          <p>You can view the signed agreement in your DocuSign account.</p>
        `,
      });
      logger.info(`Email sent to ${signer.email}`);
    } catch (error) {
      logger.error(`Error sending email to ${signer.email}:`, error);
    }
  }
} 