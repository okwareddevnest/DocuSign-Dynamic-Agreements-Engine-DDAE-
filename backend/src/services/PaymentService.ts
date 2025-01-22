import Stripe from 'stripe';
import { logger } from '../utils/logger';
import { Agreement } from '../models/Agreement';
import { AuditLog } from '../models/AuditLog';

export class PaymentService {
  private stripe: Stripe;

  constructor() {
    this.stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: '2023-10-16',
    });
  }

  async createPaymentIntent(
    agreementId: string,
    amount: number,
    currency: string = 'usd'
  ): Promise<Stripe.PaymentIntent> {
    try {
      const paymentIntent = await this.stripe.paymentIntents.create({
        amount,
        currency,
        metadata: {
          agreementId,
        },
      });

      // Log payment intent creation
      await AuditLog.create({
        entityType: 'agreement',
        entityId: agreementId,
        action: 'create',
        changes: {
          after: { paymentIntentId: paymentIntent.id },
        },
        metadata: {
          type: 'payment_intent',
          amount,
          currency,
          status: paymentIntent.status,
        },
      });

      return paymentIntent;
    } catch (error) {
      logger.error('Error creating payment intent:', error);
      throw error;
    }
  }

  async confirmPayment(paymentIntentId: string): Promise<Stripe.PaymentIntent> {
    try {
      const paymentIntent = await this.stripe.paymentIntents.confirm(paymentIntentId);

      // Get agreement ID from metadata
      const agreementId = paymentIntent.metadata.agreementId;
      if (agreementId) {
        // Log payment confirmation
        await AuditLog.create({
          entityType: 'agreement',
          entityId: agreementId,
          action: 'update',
          changes: {
            after: { paymentStatus: paymentIntent.status },
          },
          metadata: {
            type: 'payment_confirmation',
            paymentIntentId,
            status: paymentIntent.status,
          },
        });

        // Update agreement if payment is successful
        if (paymentIntent.status === 'succeeded') {
          const agreement = await Agreement.findByPk(agreementId);
          if (agreement) {
            agreement.metadata = {
              ...agreement.metadata,
              paymentStatus: 'paid',
              paymentIntentId,
              paidAmount: paymentIntent.amount,
              paidCurrency: paymentIntent.currency,
              paidAt: new Date().toISOString(),
            };
            await agreement.save();
          }
        }
      }

      return paymentIntent;
    } catch (error) {
      logger.error('Error confirming payment:', error);
      throw error;
    }
  }

  async handleWebhookEvent(
    payload: Buffer,
    signature: string
  ): Promise<{ received: boolean }> {
    try {
      const event = this.stripe.webhooks.constructEvent(
        payload,
        signature,
        process.env.STRIPE_WEBHOOK_SECRET!
      );

      switch (event.type) {
        case 'payment_intent.succeeded':
          await this.handlePaymentSuccess(event.data.object as Stripe.PaymentIntent);
          break;

        case 'payment_intent.payment_failed':
          await this.handlePaymentFailure(event.data.object as Stripe.PaymentIntent);
          break;

        // Add more event handlers as needed
      }

      return { received: true };
    } catch (error) {
      logger.error('Error handling Stripe webhook:', error);
      throw error;
    }
  }

  private async handlePaymentSuccess(paymentIntent: Stripe.PaymentIntent): Promise<void> {
    const agreementId = paymentIntent.metadata.agreementId;
    if (!agreementId) return;

    try {
      const agreement = await Agreement.findByPk(agreementId);
      if (!agreement) return;

      // Update agreement metadata
      agreement.metadata = {
        ...agreement.metadata,
        paymentStatus: 'paid',
        paymentIntentId: paymentIntent.id,
        paidAmount: paymentIntent.amount,
        paidCurrency: paymentIntent.currency,
        paidAt: new Date().toISOString(),
      };
      await agreement.save();

      // Log the payment success
      await AuditLog.create({
        entityType: 'agreement',
        entityId: agreementId,
        action: 'update',
        changes: {
          after: { paymentStatus: 'paid' },
        },
        metadata: {
          type: 'payment_success',
          paymentIntentId: paymentIntent.id,
          amount: paymentIntent.amount,
          currency: paymentIntent.currency,
        },
      });
    } catch (error) {
      logger.error('Error handling payment success:', error);
      throw error;
    }
  }

  private async handlePaymentFailure(paymentIntent: Stripe.PaymentIntent): Promise<void> {
    const agreementId = paymentIntent.metadata.agreementId;
    if (!agreementId) return;

    try {
      const agreement = await Agreement.findByPk(agreementId);
      if (!agreement) return;

      // Update agreement metadata
      agreement.metadata = {
        ...agreement.metadata,
        paymentStatus: 'failed',
        paymentIntentId: paymentIntent.id,
        lastError: paymentIntent.last_payment_error?.message,
      };
      await agreement.save();

      // Log the payment failure
      await AuditLog.create({
        entityType: 'agreement',
        entityId: agreementId,
        action: 'update',
        changes: {
          after: { paymentStatus: 'failed' },
        },
        metadata: {
          type: 'payment_failure',
          paymentIntentId: paymentIntent.id,
          error: paymentIntent.last_payment_error?.message,
        },
      });
    } catch (error) {
      logger.error('Error handling payment failure:', error);
      throw error;
    }
  }
} 