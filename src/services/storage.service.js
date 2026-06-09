const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const AppError = require('../utils/app-error');
const logger = require('../config/logger');

// Initialize S3 client using environment configurations
const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'mock-key',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'mock-secret',
  },
});

const BUCKET_NAME = process.env.AWS_S3_BUCKET || 'fitflow-assets';

// Strict file limitations
const ALLOWED_MIME_TYPES = {
  IMAGE: ['image/jpeg', 'image/png', 'image/gif', 'image/jpg', 'image/webp'],
  VIDEO: ['video/mp4', 'video/quicktime'],
  VOICE: ['audio/mpeg', 'audio/aac', 'audio/wav', 'audio/m4a', 'audio/x-m4a', 'audio/ogg', 'audio/mp4', 'audio/webm', 'audio/3gpp'],
  DOCUMENT: [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain',
    'application/zip',
    'application/octet-stream'
  ]
};

const MAX_FILE_SIZES = {
  IMAGE: 10 * 1024 * 1024, // 10MB
  VIDEO: 50 * 1024 * 1024, // 50MB
  VOICE: 10 * 1024 * 1024, // 10MB
  DOCUMENT: 10 * 1024 * 1024 // 10MB
};

/**
 * Validate file metadata and return category
 */
const validateFile = (mimeType, fileSize) => {
  let category = null;

  if (ALLOWED_MIME_TYPES.IMAGE.includes(mimeType)) {
    category = 'IMAGE';
  } else if (ALLOWED_MIME_TYPES.VIDEO.includes(mimeType)) {
    category = 'VIDEO';
  } else if (ALLOWED_MIME_TYPES.VOICE.includes(mimeType)) {
    category = 'VOICE';
  } else if (ALLOWED_MIME_TYPES.DOCUMENT.includes(mimeType)) {
    category = 'DOCUMENT';
  } else {
    throw new AppError(400, null, `Mime type ${mimeType} is not supported. Supported: image, video, audio, or document files.`);
  }

  const maxLimit = MAX_FILE_SIZES[category];
  if (fileSize > maxLimit) {
    throw new AppError(400, null, `File size exceeds the limit for ${category} (${maxLimit / (1024 * 1024)}MB)`);
  }

  return category;
};

/**
 * Generate S3 Presigned Upload URL (PUT method)
 */
const getPresignedUploadUrl = async (gymId, conversationId, fileName, fileSize, mimeType, requestBaseUrl = '') => {
  try {
    const category = validateFile(mimeType, fileSize);
    
    // Unique key: gyms/${gymId}/conversations/${conversationId}/${Date.now()}_${fileName}
    const cleanFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
    const key = `gyms/${gymId}/conversations/${conversationId}/${Date.now()}_${cleanFileName}`;

    const isMock = !process.env.AWS_ACCESS_KEY_ID || 
                   process.env.AWS_ACCESS_KEY_ID === 'mock-key' ||
                   !process.env.AWS_SECRET_ACCESS_KEY ||
                   process.env.AWS_SECRET_ACCESS_KEY === 'mock-secret';

    if (isMock) {
      // Local fallback URLs
      const uploadUrl = `${requestBaseUrl}/api/v1/chats/upload-local/${key}`;
      const publicUrl = `${requestBaseUrl}/uploads/${key}`;
      return {
        uploadUrl,
        publicUrl,
        key
      };
    }

    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      ContentType: mimeType,
    });

    // Signed URL expires in 15 minutes
    const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 900 });
    const publicUrl = `https://${BUCKET_NAME}.s3.amazonaws.com/${key}`;

    return {
      uploadUrl,
      publicUrl,
      key
    };
  } catch (error) {
    if (error instanceof AppError) throw error;
    logger.error('Error generating S3 presigned URL:', error);
    throw new AppError(500, null, 'Error generating upload ticket');
  }
};

module.exports = {
  getPresignedUploadUrl,
  validateFile
};
