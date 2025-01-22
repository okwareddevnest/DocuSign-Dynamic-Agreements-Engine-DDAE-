import { Template } from '../models/Template';
import { AuditLog } from '../models/AuditLog';
import { AppError } from '../middleware/errorHandler';
import { minioClient } from '../config/minio';
import { logger } from '../utils/logger';

export class TemplateService {
  private bucketName: string;

  constructor() {
    this.bucketName = process.env.MINIO_BUCKET_NAME || 'ddae-documents';
  }

  async createTemplate(data: {
    name: string;
    description?: string;
    docusignTemplateId: string;
    dynamicFields: Record<string, {
      type: 'price' | 'iot' | 'weather';
      source: string;
      path: string;
      threshold?: number;
      operator?: '>' | '<' | '==' | '>=' | '<=';
    }>;
  }): Promise<Template> {
    const template = await Template.create(data);

    await AuditLog.create({
      entityType: 'template',
      entityId: template.id,
      action: 'create',
      changes: {
        after: template.toJSON(),
      },
    });

    return template;
  }

  async updateTemplate(
    templateId: string,
    updates: Partial<Template>
  ): Promise<Template> {
    const template = await Template.findByPk(templateId);
    if (!template) {
      throw new AppError(404, 'Template not found');
    }

    const oldValues = template.toJSON();
    await template.update(updates);

    await AuditLog.create({
      entityType: 'template',
      entityId: template.id,
      action: 'update',
      changes: {
        before: oldValues,
        after: template.toJSON(),
      },
    });

    return template;
  }

  async getTemplate(templateId: string): Promise<Template> {
    const template = await Template.findByPk(templateId);
    if (!template) {
      throw new AppError(404, 'Template not found');
    }
    return template;
  }

  async listTemplates(): Promise<Template[]> {
    return Template.findAll({
      order: [['createdAt', 'DESC']],
    });
  }

  async deleteTemplate(templateId: string): Promise<void> {
    const template = await Template.findByPk(templateId);
    if (!template) {
      throw new AppError(404, 'Template not found');
    }

    const oldValues = template.toJSON();

    // Delete from database
    await template.destroy();

    // Log the deletion
    await AuditLog.create({
      entityType: 'template',
      entityId: template.id,
      action: 'delete',
      changes: {
        before: oldValues,
      },
    });
  }

  async uploadTemplateFile(
    templateId: string,
    file: Buffer,
    filename: string
  ): Promise<string> {
    const template = await Template.findByPk(templateId);
    if (!template) {
      throw new AppError(404, 'Template not found');
    }

    const objectName = `templates/${templateId}/${filename}`;

    try {
      await minioClient.putObject(this.bucketName, objectName, file);
      logger.info(`Template file uploaded: ${objectName}`);
      return objectName;
    } catch (error) {
      logger.error('Error uploading template file:', error);
      throw new AppError(500, 'Failed to upload template file');
    }
  }

  async getTemplateFile(templateId: string, filename: string): Promise<Buffer> {
    const template = await Template.findByPk(templateId);
    if (!template) {
      throw new AppError(404, 'Template not found');
    }

    const objectName = `templates/${templateId}/${filename}`;

    try {
      const data = await minioClient.getObject(this.bucketName, objectName);
      const chunks: Buffer[] = [];
      
      for await (const chunk of data) {
        chunks.push(chunk);
      }
      
      return Buffer.concat(chunks);
    } catch (error) {
      logger.error('Error retrieving template file:', error);
      throw new AppError(500, 'Failed to retrieve template file');
    }
  }
} 