import docusign from 'docusign-esign';
import fs from 'fs';
import path from 'path';
import { logger } from '../utils/logger';
import { Redis } from 'ioredis';

export class DocuSignService {
  private apiClient: docusign.ApiClient;
  private redis: Redis;
  private accountId: string;
  private integrationKey: string;
  private userId: string;
  private privateKey: string;

  constructor(redis: Redis) {
    this.redis = redis;
    this.apiClient = new docusign.ApiClient();
    this.apiClient.setBasePath('https://demo.docusign.net/restapi');
    
    this.accountId = process.env.DOCUSIGN_ACCOUNT_ID || '';
    this.integrationKey = process.env.DOCUSIGN_INTEGRATION_KEY || '';
    this.userId = process.env.DOCUSIGN_USER_ID || '';
    
    // Load private key from file or environment
    this.privateKey = process.env.DOCUSIGN_PRIVATE_KEY || '';
    if (!this.privateKey && process.env.DOCUSIGN_PRIVATE_KEY_PATH) {
      this.privateKey = fs.readFileSync(
        path.resolve(process.env.DOCUSIGN_PRIVATE_KEY_PATH),
        'utf8'
      );
    }
  }

  private async getAccessToken(): Promise<string> {
    const cacheKey = `docusign:access_token:${this.userId}`;
    
    try {
      // Check cache first
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        return cached;
      }

      // Request new token using JWT
      const response = await this.apiClient.requestJWTUserToken(
        this.integrationKey,
        this.userId,
        ['signature', 'impersonation'],
        this.privateKey,
        3600 // 1 hour expiry
      );

      const accessToken = response.body.access_token;
      
      // Cache token for 50 minutes (10 minutes less than expiry)
      await this.redis.set(cacheKey, accessToken, 'EX', 3000);
      
      return accessToken;
    } catch (error) {
      logger.error('Error getting DocuSign access token:', error);
      throw error;
    }
  }

  private async getAuthorizedClient(): Promise<docusign.ApiClient> {
    const accessToken = await this.getAccessToken();
    this.apiClient.addDefaultHeader('Authorization', `Bearer ${accessToken}`);
    return this.apiClient;
  }

  async createEnvelope(
    templateId: string,
    signers: Array<{
      email: string;
      name: string;
      role: string;
      tabs?: Record<string, string>;
    }>
  ): Promise<{ envelopeId: string }> {
    try {
      const apiClient = await this.getAuthorizedClient();
      const envelopesApi = new docusign.EnvelopesApi(apiClient);

      // Create envelope definition
      const envelopeDef = new docusign.EnvelopeDefinition();
      envelopeDef.templateId = templateId;

      // Set template roles with tabs
      const templateRoles = signers.map(signer => ({
        email: signer.email,
        name: signer.name,
        roleName: signer.role,
        tabs: signer.tabs ? {
          textTabs: Object.entries(signer.tabs).map(([key, value]) => ({
            tabLabel: key,
            value: String(value),
          })),
        } : undefined,
      }));

      envelopeDef.templateRoles = templateRoles;
      envelopeDef.status = 'sent';

      // Create envelope
      const results = await envelopesApi.createEnvelope(this.accountId, {
        envelopeDefinition: envelopeDef,
      });

      return { envelopeId: results.envelopeId };
    } catch (error) {
      logger.error('Error creating DocuSign envelope:', error);
      throw error;
    }
  }

  async getEnvelopeStatus(envelopeId: string): Promise<{
    status: string;
    signers: Array<{
      email: string;
      name: string;
      status: string;
      signedDate?: string;
    }>;
  }> {
    try {
      const apiClient = await this.getAuthorizedClient();
      const envelopesApi = new docusign.EnvelopesApi(apiClient);

      const results = await envelopesApi.listRecipients(this.accountId, envelopeId);

      return {
        status: results.status || 'unknown',
        signers: results.signers?.map(signer => ({
          email: signer.email,
          name: signer.name,
          status: signer.status,
          signedDate: signer.signedDateTime,
        })) || [],
      };
    } catch (error) {
      logger.error('Error getting envelope status:', error);
      throw error;
    }
  }

  async downloadSignedDocument(envelopeId: string): Promise<Buffer> {
    try {
      const apiClient = await this.getAuthorizedClient();
      const envelopesApi = new docusign.EnvelopesApi(apiClient);

      const results = await envelopesApi.getDocument(
        this.accountId,
        envelopeId,
        'combined'
      );

      return Buffer.from(results, 'binary');
    } catch (error) {
      logger.error('Error downloading signed document:', error);
      throw error;
    }
  }

  async validateWebhookSignature(
    signature: string,
    payload: string
  ): Promise<boolean> {
    try {
      const hmac = require('crypto').createHmac(
        'sha256',
        process.env.DOCUSIGN_WEBHOOK_SECRET || ''
      );
      const calculatedSignature = hmac.update(payload).digest('hex');
      return signature === calculatedSignature;
    } catch (error) {
      logger.error('Error validating webhook signature:', error);
      return false;
    }
  }
} 