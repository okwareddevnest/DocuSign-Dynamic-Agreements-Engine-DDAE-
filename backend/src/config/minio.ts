import { Client } from 'minio';
import { logger } from '../utils/logger';

const minioClient = new Client({
  endPoint: process.env.MINIO_HOST || 'localhost',
  port: parseInt(process.env.MINIO_PORT || '9000'),
  useSSL: process.env.NODE_ENV === 'production',
  accessKey: process.env.MINIO_ROOT_USER!,
  secretKey: process.env.MINIO_ROOT_PASSWORD!,
});

export async function setupMinio() {
  const bucketName = process.env.MINIO_BUCKET_NAME || 'ddae-documents';

  try {
    // Check if bucket exists
    const exists = await minioClient.bucketExists(bucketName);
    
    if (!exists) {
      // Create bucket if it doesn't exist
      await minioClient.makeBucket(bucketName);
      logger.info(`Created MinIO bucket: ${bucketName}`);

      // Set bucket policy for public read if needed
      const policy = {
        Version: '2012-10-17',
        Statement: [
          {
            Effect: 'Allow',
            Principal: { AWS: ['*'] },
            Action: ['s3:GetObject'],
            Resource: [`arn:aws:s3:::${bucketName}/*`],
          },
        ],
      };

      await minioClient.setBucketPolicy(bucketName, JSON.stringify(policy));
    }

    logger.info('MinIO connection established successfully');
    return minioClient;
  } catch (error) {
    logger.error('Unable to setup MinIO:', error);
    throw error;
  }
}

export { minioClient }; 