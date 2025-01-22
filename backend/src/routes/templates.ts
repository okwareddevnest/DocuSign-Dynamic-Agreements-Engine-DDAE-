import express from 'express';
import multer from 'multer';
import { TemplateService } from '../services/TemplateService';
import { DocuSignService } from '../services/DocuSignService';
import { Redis } from 'ioredis';
import { AppError } from '../middleware/errorHandler';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// Initialize services
const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD,
});

const templateService = new TemplateService();
const docuSignService = new DocuSignService(redis);

// Create template
router.post('/', async (req, res, next) => {
  try {
    const {
      name,
      description,
      docusignTemplateId,
      dynamicFields,
    } = req.body;

    const template = await templateService.createTemplate({
      name,
      description,
      docusignTemplateId,
      dynamicFields,
    });

    res.json(template);
  } catch (error) {
    next(error);
  }
});

// Get template
router.get('/:id', async (req, res, next) => {
  try {
    const template = await templateService.getTemplate(req.params.id);
    res.json(template);
  } catch (error) {
    next(error);
  }
});

// List templates
router.get('/', async (req, res, next) => {
  try {
    const templates = await templateService.listTemplates();
    res.json(templates);
  } catch (error) {
    next(error);
  }
});

// Update template
router.put('/:id', async (req, res, next) => {
  try {
    const {
      name,
      description,
      docusignTemplateId,
      dynamicFields,
    } = req.body;

    const template = await templateService.updateTemplate(req.params.id, {
      name,
      description,
      docusignTemplateId,
      dynamicFields,
    });

    res.json(template);
  } catch (error) {
    next(error);
  }
});

// Delete template
router.delete('/:id', async (req, res, next) => {
  try {
    await templateService.deleteTemplate(req.params.id);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

// Upload template file
router.post('/:id/files', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) {
      throw new AppError(400, 'No file uploaded');
    }

    const objectName = await templateService.uploadTemplateFile(
      req.params.id,
      req.file.buffer,
      req.file.originalname
    );

    res.json({ objectName });
  } catch (error) {
    next(error);
  }
});

// Get template file
router.get('/:id/files/:filename', async (req, res, next) => {
  try {
    const file = await templateService.getTemplateFile(
      req.params.id,
      req.params.filename
    );

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${req.params.filename}"`
    );
    res.send(file);
  } catch (error) {
    next(error);
  }
});

export default router; 