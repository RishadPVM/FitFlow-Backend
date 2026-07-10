const { PutObjectCommand, DeleteObjectCommand, DeleteObjectsCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const AppError = require('../utils/app-error');
const logger = require('../config/logger');
const s3Client = require('../config/awsConfig');
const env = require('../config/env');

const BUCKET_NAME = env.awsBucketName || 'prod-gym-os';

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
const getPresignedUploadUrl = async (gymId, conversationId, fileName, fileSize, mimeType, requestBaseUrl = '', userId = null) => {
  try {
    const category = validateFile(mimeType, fileSize);
    
    const cleanFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
    let key;
    if (userId) {
      key = `users/${userId}/profile/${Date.now()}_${cleanFileName}`;
    } else if (gymId && conversationId) {
      key = `gyms/${gymId}/conversations/${conversationId}/${Date.now()}_${cleanFileName}`;
    } else if (gymId) {
      key = `gyms/${gymId}/profile/${Date.now()}_${cleanFileName}`;
    } else {
      key = `general/${Date.now()}_${cleanFileName}`;
    }

    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      ContentType: mimeType,
    });

    // Signed URL expires in 15 minutes
    const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 900 });
    
    // Generate signed download URL for direct access (valid for 1 hour)
    const getCommand = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    });
    const publicUrl = await getSignedUrl(s3Client, getCommand, { expiresIn: 3600 });

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

/**
 * Delete a single file from S3
 */
const deleteFile = async (key) => {
  if (!key) return;
  try {
    const command = new DeleteObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    });
    await s3Client.send(command);
    logger.info(`Successfully deleted S3 object with key: ${key}`);
  } catch (error) {
    logger.error(`Error deleting S3 object with key ${key}:`, error);
  }
};

/**
 * Batch delete multiple files from S3
 */
const deleteFiles = async (keys) => {
  const validKeys = keys.filter(Boolean);
  if (validKeys.length === 0) return;
  
  try {
    const command = new DeleteObjectsCommand({
      Bucket: BUCKET_NAME,
      Delete: {
        Objects: validKeys.map(key => ({ Key: key }))
      }
    });
    await s3Client.send(command);
    logger.info(`Successfully deleted S3 objects: ${validKeys.join(', ')}`);
  } catch (error) {
    logger.error('Error batch deleting S3 objects:', error);
  }
};

/**
 * Helper to extract S3 key from S3 URL
 */
const extractKeyFromUrl = (url) => {
  if (!url) return null;
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return url;
  }
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname;
    if (hostname.includes('.s3.')) {
      return decodeURIComponent(parsed.pathname.slice(1));
    }
    if (hostname.endsWith('.s3.amazonaws.com')) {
      return decodeURIComponent(parsed.pathname.slice(1));
    }
    return decodeURIComponent(parsed.pathname.slice(1));
  } catch (error) {
    return url;
  }
};

const getSignedDownloadUrl = async (key) => {
  if (!key) return null;
  try {
    const command = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    });
    // Signed read URL expires in 1 hour
    return await getSignedUrl(s3Client, command, { expiresIn: 3600 });
  } catch (error) {
    logger.error('Error generating signed GET URL:', error);
    return null;
  }
};

module.exports = {
  getPresignedUploadUrl,
  validateFile,
  deleteFile,
  deleteFiles,
  extractKeyFromUrl,
  getSignedDownloadUrl
};
