import crypto from 'node:crypto';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getLocalDb } from '../db/localDatabase.ts';
import {
  getSupabaseServerClient,
  isSupabaseTableMissingError,
} from '../lib/supabaseServer.ts';

export const MAX_AVATAR_BYTES = 5 * 1024 * 1024; // 5 MB

export type AllowedImageMime = 'image/jpeg' | 'image/png' | 'image/webp';

/**
 * Inspects binary magic bytes to verify genuine JPG, PNG, or WebP content
 * regardless of client-supplied filename or Content-Type header.
 */
export function detectImageMimeFromMagicBytes(buffer: Buffer): AllowedImageMime | null {
  if (!buffer || buffer.length < 12) return null;

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return 'image/png';
  }

  // WebP: "RIFF" .... "WEBP"
  if (
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return 'image/webp';
  }

  return null;
}

function getExtensionForMime(mime: AllowedImageMime): string {
  switch (mime) {
    case 'image/jpeg':
      return 'jpg';
    case 'image/png':
      return 'png';
    case 'image/webp':
      return 'webp';
  }
}

export function isS3Configured(): boolean {
  const bucket = process.env.S3_BUCKET?.trim();
  const accessKeyId = process.env.S3_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY?.trim();
  return Boolean(
    bucket &&
      accessKeyId &&
      secretAccessKey &&
      bucket !== 'YOUR_BUCKET_NAME' &&
      accessKeyId !== 'YOUR_S3_ACCESS_KEY_ID'
  );
}

let cachedS3Client: S3Client | null = null;

function getS3Client(): S3Client {
  if (!cachedS3Client) {
    const region = process.env.S3_REGION?.trim() || 'auto';
    const endpoint = process.env.S3_ENDPOINT?.trim();
    cachedS3Client = new S3Client({
      region,
      ...(endpoint ? { endpoint, forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true' } : {}),
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY_ID!.trim(),
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!.trim(),
      },
    });
  }
  return cachedS3Client;
}

export async function storeProfilePicture(fileBuffer: Buffer): Promise<{
  url: string;
  mimeType: AllowedImageMime;
  byteSize: number;
  storageDriver: 's3' | 'supabase-storage' | 'supabase-db' | 'persistent-local';
}> {
  if (!fileBuffer || fileBuffer.length === 0) {
    throw new Error('Uploaded image file is empty.');
  }

  if (fileBuffer.length > MAX_AVATAR_BYTES) {
    throw new Error('Profile picture must be 5 MB or smaller.');
  }

  const detectedMime = detectImageMimeFromMagicBytes(fileBuffer);
  if (!detectedMime) {
    throw new Error('Invalid image format. Only genuine JPG, PNG, and WebP images are allowed.');
  }

  const ext = getExtensionForMime(detectedMime);
  const objectKey = `avatar_${Date.now()}_${crypto.randomBytes(12).toString('hex')}.${ext}`;
  const base64Data = fileBuffer.toString('base64');
  const nowIso = new Date().toISOString();

  // Save to local fallback DB first so it's always immediately available via /api/media/:key
  try {
    const ldb = getLocalDb();
    ldb.prepare(`
      INSERT INTO local_stored_media (object_key, mime_type, byte_size, base64_data, created_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(object_key) DO NOTHING
    `).run(objectKey, detectedMime, fileBuffer.length, base64Data, nowIso);
  } catch {}

  // 1. S3 / Cloudflare R2 / Tigris persistent object storage if configured
  if (isS3Configured()) {
    const bucket = process.env.S3_BUCKET!.trim();
    const s3 = getS3Client();
    const s3Key = `avatars/${objectKey}`;

    try {
      await s3.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: s3Key,
          Body: fileBuffer,
          ContentType: detectedMime,
          CacheControl: 'public, max-age=31536000, immutable',
        })
      );

      const publicBase = process.env.S3_PUBLIC_BASE_URL?.trim()?.replace(/\/$/, '');
      const region = process.env.S3_REGION?.trim() || 'us-east-1';
      const url = publicBase
        ? `${publicBase}/${s3Key}`
        : `https://${bucket}.s3.${region}.amazonaws.com/${s3Key}`;

      return {
        url,
        mimeType: detectedMime,
        byteSize: fileBuffer.length,
        storageDriver: 's3',
      };
    } catch (error) {
      console.error('S3 upload error:', error);
      throw new Error('Failed to store profile picture in object storage.', { cause: error });
    }
  }

  // 2. Supabase Storage ('avatars' bucket) or Supabase 'stored_media' table if available
  const supabase = getSupabaseServerClient();
  if (supabase) {
    try {
      const storageRes = await supabase.storage.from('avatars').upload(objectKey, fileBuffer, {
        contentType: detectedMime,
        cacheControl: '31536000',
        upsert: false,
      });

      if (!storageRes.error) {
        const { data: pubData } = supabase.storage.from('avatars').getPublicUrl(objectKey);
        if (pubData?.publicUrl) {
          return {
            url: pubData.publicUrl,
            mimeType: detectedMime,
            byteSize: fileBuffer.length,
            storageDriver: 'supabase-storage',
          };
        }
      }
    } catch {}

    try {
      const dbMediaRes = await supabase.from('stored_media').insert({
        object_key: objectKey,
        mime_type: detectedMime,
        byte_size: fileBuffer.length,
        base64_data: base64Data,
      });

      if (!dbMediaRes.error) {
        return {
          url: `/api/media/${objectKey}`,
          mimeType: detectedMime,
          byteSize: fileBuffer.length,
          storageDriver: 'supabase-db',
        };
      }
    } catch {}
  }

  // 3. Persistent local media store
  return {
    url: `/api/media/${objectKey}`,
    mimeType: detectedMime,
    byteSize: fileBuffer.length,
    storageDriver: 'persistent-local',
  };
}

export async function getStoredMediaByKey(
  objectKey: string
): Promise<{ buffer: Buffer; mimeType: string } | null> {
  const supabase = getSupabaseServerClient();
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('stored_media')
        .select('mime_type, base64_data')
        .eq('object_key', objectKey)
        .maybeSingle();

      if (!error && data) {
        return {
          buffer: Buffer.from(data.base64_data, 'base64'),
          mimeType: data.mime_type,
        };
      }
    } catch {}
  }

  try {
    const ldb = getLocalDb();
    const row = ldb.prepare('SELECT mime_type, base64_data FROM local_stored_media WHERE object_key = ? LIMIT 1').get(objectKey) as { mime_type: string; base64_data: string } | undefined;
    if (row) {
      return {
        buffer: Buffer.from(row.base64_data, 'base64'),
        mimeType: row.mime_type,
      };
    }
  } catch {}

  return null;
}

export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024; // 25 MB

export interface StoredAttachmentResult {
  url: string;
  fileName: string;
  mimeType: string;
  byteSize: number;
  mediaType: 'image' | 'video' | 'audio' | 'document';
  storageDriver: 's3' | 'supabase-storage' | 'supabase-db' | 'persistent-local';
}

function detectMediaType(mime: string): 'image' | 'video' | 'audio' | 'document' {
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  return 'document';
}

export async function storeSharedAttachment(
  fileBuffer: Buffer,
  originalFileName: string,
  clientMimeType?: string
): Promise<StoredAttachmentResult> {
  if (!fileBuffer || fileBuffer.length === 0) {
    throw new Error('Uploaded attachment is empty.');
  }

  if (fileBuffer.length > MAX_ATTACHMENT_BYTES) {
    throw new Error('Attachment must be 25 MB or smaller.');
  }

  // Clean filename and extract extension
  let safeName = (originalFileName || 'attachment')
    .replace(/\\/g, '/')
    .split('/')
    .pop()!
    .normalize('NFC')
    .replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/g, '_')
    .replace(/\s+/g, ' ')
    .replace(/^[.\s]+|[.\s]+$/g, '')
    .trim() || 'attachment';
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(safeName)) safeName = `_${safeName}`;
  if (safeName.length > 180) {
    const extension = safeName.match(/(\.[^.]+)$/)?.[1] || '';
    safeName = `${safeName.slice(0, Math.max(1, 180 - extension.length))}${extension}`;
  }
  const extMatch = safeName.match(/\.([a-zA-Z0-9]+)$/);
  const ext = extMatch ? extMatch[1].toLowerCase() : 'bin';

  // Determine mime type
  let mime = clientMimeType?.trim() || 'application/octet-stream';
  if (mime === 'application/octet-stream') {
    switch (ext) {
      case 'jpg':
      case 'jpeg':
        mime = 'image/jpeg';
        break;
      case 'png':
        mime = 'image/png';
        break;
      case 'webp':
        mime = 'image/webp';
        break;
      case 'gif':
        mime = 'image/gif';
        break;
      case 'mp4':
        mime = 'video/mp4';
        break;
      case 'webm':
        mime = 'video/webm';
        break;
      case 'mp3':
        mime = 'audio/mpeg';
        break;
      case 'wav':
        mime = 'audio/wav';
        break;
      case 'ogg':
        mime = 'audio/ogg';
        break;
      case 'pdf':
        mime = 'application/pdf';
        break;
      case 'doc':
        mime = 'application/msword';
        break;
      case 'docx':
        mime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
        break;
      case 'xls':
        mime = 'application/vnd.ms-excel';
        break;
      case 'xlsx':
        mime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
        break;
      case 'ppt':
        mime = 'application/vnd.ms-powerpoint';
        break;
      case 'pptx':
        mime = 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
        break;
      case 'txt':
        mime = 'text/plain';
        break;
      case 'csv':
        mime = 'text/csv';
        break;
      case 'zip':
        mime = 'application/zip';
        break;
    }
  }

  const mediaType = detectMediaType(mime);
  const uniqueId = crypto.randomBytes(12).toString('hex');
  const objectKey = `att_${Date.now()}_${uniqueId}_${safeName}`;
  const base64Data = fileBuffer.toString('base64');
  const nowIso = new Date().toISOString();

  // 1. Store in local fallback database
  try {
    const ldb = getLocalDb();
    ldb.prepare(`
      INSERT INTO local_stored_media (object_key, mime_type, byte_size, base64_data, created_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(object_key) DO NOTHING
    `).run(objectKey, mime, fileBuffer.length, base64Data, nowIso);
  } catch {}

  // 2. S3 object storage if configured
  if (isS3Configured()) {
    const bucket = process.env.S3_BUCKET!.trim();
    const s3 = getS3Client();
    const s3Key = `attachments/${objectKey}`;

    try {
      await s3.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: s3Key,
          Body: fileBuffer,
          ContentType: mime,
          CacheControl: 'public, max-age=31536000, immutable',
        })
      );

      const publicBase = process.env.S3_PUBLIC_BASE_URL?.trim()?.replace(/\/$/, '');
      const region = process.env.S3_REGION?.trim() || 'us-east-1';
      const url = publicBase
        ? `${publicBase}/${s3Key}`
        : `https://${bucket}.s3.${region}.amazonaws.com/${s3Key}`;

      return {
        url,
        fileName: safeName,
        mimeType: mime,
        byteSize: fileBuffer.length,
        mediaType,
        storageDriver: 's3',
      };
    } catch (error) {
      console.error('S3 attachment upload error:', error);
    }
  }

  // 3. Supabase storage bucket or stored_media table
  const supabase = getSupabaseServerClient();
  if (supabase) {
    try {
      const storageRes = await supabase.storage.from('attachments').upload(objectKey, fileBuffer, {
        contentType: mime,
        cacheControl: '31536000',
        upsert: false,
      });

      if (!storageRes.error) {
        const { data: pubData } = supabase.storage.from('attachments').getPublicUrl(objectKey);
        if (pubData?.publicUrl) {
          return {
            url: pubData.publicUrl,
            fileName: safeName,
            mimeType: mime,
            byteSize: fileBuffer.length,
            mediaType,
            storageDriver: 'supabase-storage',
          };
        }
      }
    } catch {}

    try {
      const dbMediaRes = await supabase.from('stored_media').insert({
        object_key: objectKey,
        mime_type: mime,
        byte_size: fileBuffer.length,
        base64_data: base64Data,
      });

      if (!dbMediaRes.error) {
        return {
          url: `/api/media/${objectKey}`,
          fileName: safeName,
          mimeType: mime,
          byteSize: fileBuffer.length,
          mediaType,
          storageDriver: 'supabase-db',
        };
      }
    } catch {}
  }

  // 4. Persistent local fallback
  return {
    url: `/api/media/${objectKey}`,
    fileName: safeName,
    mimeType: mime,
    byteSize: fileBuffer.length,
    mediaType,
    storageDriver: 'persistent-local',
  };
}
