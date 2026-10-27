import crypto from 'node:crypto';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { eq } from 'drizzle-orm';
import { db } from '../db/index.ts';
import { storedMedia } from '../db/schema.ts';
import {
  getSupabaseServerClient,
  isSupabaseConfigured,
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
  storageDriver: 's3' | 'supabase-storage' | 'supabase-db' | 'postgresql-persistent';
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

    const dbMediaRes = await supabase.from('stored_media').insert({
      object_key: objectKey,
      mime_type: detectedMime,
      byte_size: fileBuffer.length,
      base64_data: fileBuffer.toString('base64'),
    });

    if (!dbMediaRes.error) {
      return {
        url: `/api/media/${objectKey}`,
        mimeType: detectedMime,
        byteSize: fileBuffer.length,
        storageDriver: 'supabase-db',
      };
    } else if (!isSupabaseTableMissingError(dbMediaRes.error)) {
      console.warn('Supabase stored_media insert warning:', dbMediaRes.error.message);
    }
  }

  // 3. Persistent PostgreSQL media store
  try {
    await db.insert(storedMedia).values({
      objectKey,
      mimeType: detectedMime,
      byteSize: fileBuffer.length,
      base64Data: fileBuffer.toString('base64'),
    });

    return {
      url: `/api/media/${objectKey}`,
      mimeType: detectedMime,
      byteSize: fileBuffer.length,
      storageDriver: 'postgresql-persistent',
    };
  } catch (error) {
    console.error('Database media storage error:', error);
    if (isSupabaseConfigured()) {
      throw new Error(
        'Failed to store profile picture. Ensure supabase_schema.sql has been executed in your Supabase SQL Editor.',
        { cause: error }
      );
    }
    throw new Error('Failed to persist profile picture.', { cause: error });
  }
}

export async function getStoredMediaByKey(
  objectKey: string
): Promise<{ buffer: Buffer; mimeType: string } | null> {
  const supabase = getSupabaseServerClient();
  if (supabase) {
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
  }

  try {
    const rows = await db
      .select()
      .from(storedMedia)
      .where(eq(storedMedia.objectKey, objectKey))
      .limit(1);

    if (!rows.length) return null;
    const item = rows[0];
    return {
      buffer: Buffer.from(item.base64Data, 'base64'),
      mimeType: item.mimeType,
    };
  } catch (error) {
    console.error('Failed to read stored media:', error);
    return null;
  }
}
