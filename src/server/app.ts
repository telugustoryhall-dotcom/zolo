import crypto from 'node:crypto';
import express, { type Request, type Response, type NextFunction } from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import type { CountryCode } from 'libphonenumber-js';
import {
  AppDomainError,
  SESSION_DURATION_MS,
  changeAccountPassword,
  changePhoneNumberDirect,
  checkDatabaseHealth,
  linkFirebaseGoogleForRecovery,
  listActiveSessionsForUser,
  loginUserByMobile,
  permanentlyDeleteAccount,
  recoverAccountDirect,
  registerUserDirect,
  revokeAllSessionsForUser,
  revokeSingleSession,
  saveUserChatState,
  toPublicUser,
  updateUserProfileRecord,
} from '../db/repository.ts';
import {
  type DirectMessageDto,
  type MessageRichPayload,
  deleteDirectMessageInDb,
  fetchUserDirectMessagesAndPeers,
  lookupRegisteredUsersByPhones,
  markConversationReadInDb,
  markUndeliveredMessagesDelivered,
  saveDirectMessage,
  searchRegisteredUsers,
  toggleMessageReactionInDb,
  voteMessagePollInDb,
} from '../db/messagingRepository.ts';
import {
  createGroupInDb,
  fetchGroupInboxForUser,
  isGroupMember,
  saveGroupMessage,
} from '../db/groupRepository.ts';
import {
  createStatusStoryInDb,
  fetchUserCallHistory,
  fetchVisibleStatusStories,
  markMissedCallsSeenInDb,
  markStatusStoryViewedInDb,
  getActiveGroupCallFromDb,
} from '../db/statusAndCallsRepository.ts';
import {
  fetchUserCategoriesAndMap,
  createCustomCategory,
  updateCustomCategory,
  deleteCustomCategory,
  saveChatCategoryAssignments,
  fetchUserChatThemes,
  saveUserChatTheme,
  deleteUserChatTheme,
  fetchUserRingtoneSettings,
  saveUserRingtoneSettings,
} from '../db/customizationRepository.ts';
import {
  type AuthenticatedRequest,
  SESSION_COOKIE_NAME,
  requireSessionAuth,
  verifyOptionalFirebaseIdToken,
} from '../middleware/auth.ts';
import { isSupabaseConfigured } from '../lib/supabaseServer.ts';
import { normalizeAndValidatePhone } from './phoneUtils.ts';
import { realtimeHub } from './realtimeHub.ts';
import {
  MAX_AVATAR_BYTES,
  MAX_ATTACHMENT_BYTES,
  getStoredMediaByKey,
  isS3Configured,
  storeProfilePicture,
  storeSharedAttachment,
} from './storageService.ts';
import {
  summarizeConversation,
  suggestOrPolishReplies,
  extractDecisionsAndTasks,
} from './aiService.ts';
import {
  fetchTasksForConversation,
  createGroupTaskInDb,
  updateGroupTaskInDb,
  deleteGroupTaskInDb,
  fetchNotesForConversation,
  saveGroupNoteInDb,
  deleteGroupNoteInDb,
  fetchEventsForConversation,
  createGroupEventInDb,
  deleteGroupEventInDb,
  scheduleMessageInDb,
  fetchScheduledMessagesForSender,
  cancelScheduledMessageInDb,
} from './workspaceRepository.ts';
import { startSchedulerRunner } from './schedulerRunner.ts';
import { fetchSafeLinkPreview, validatePublicWebUrl } from './linkPreview.ts';
import {
  createAdCampaign,
  deleteAdCampaign,
  getAdCampaign,
  getAdAnalytics,
  listAdCampaigns,
  listAdReports,
  recordAdEvent,
  reportAd,
  setAdCampaignStatus,
  updateAdCampaign,
} from '../db/adsRepository.ts';
import type { AdCreativeInput, AdStatus } from '../types/ads.ts';

export interface CreateAppOptions {
  disableRateLimit?: boolean;
}

function setSessionCookie(req: Request, res: Response, token: string): void {
  const isHttps =
    req.secure ||
    req.headers['x-forwarded-proto'] === 'https' ||
    process.env.NODE_ENV === 'production';

  res.cookie(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: isHttps,
    sameSite: isHttps ? 'none' : 'lax',
    maxAge: SESSION_DURATION_MS,
    path: '/',
    ...(isHttps ? ({ partitioned: true } as Record<string, unknown>) : {}),
  });
}

function clearSessionCookie(req: Request, res: Response): void {
  const isHttps =
    req.secure ||
    req.headers['x-forwarded-proto'] === 'https' ||
    process.env.NODE_ENV === 'production';

  res.clearCookie(SESSION_COOKIE_NAME, {
    httpOnly: true,
    secure: isHttps,
    sameSite: isHttps ? 'none' : 'lax',
    path: '/',
  });
}

function parseSavedChatState(rawJson: string | null): unknown {
  if (!rawJson) return null;
  try {
    return JSON.parse(rawJson);
  } catch {
    return null;
  }
}

function isConfiguredAdAdmin(phone: string): boolean {
  const admins = (process.env.ZOLO_AD_ADMIN_PHONES || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  return admins.includes(phone);
}

function hashAdIdentity(phone: string): string {
  const secret =
    process.env.ZOLO_AD_ANALYTICS_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.AUTH_SECRET ||
    'zolo-local-ad-analytics-key';
  return crypto.createHmac('sha256', secret).update(phone).digest('hex');
}

function isTrustedAdImageUrl(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 2048) return false;
  if (/^\/api\/media\/[a-zA-Z0-9._-]+$/.test(value)) return true;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:') return false;
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  if (supabaseUrl) {
    try {
      if (url.origin === new URL(supabaseUrl).origin &&
          url.pathname.startsWith('/storage/v1/object/public/attachments/')) return true;
    } catch {
      return false;
    }
  }
  const s3PublicBase = process.env.S3_PUBLIC_BASE_URL?.replace(/\/+$/, '');
  if (s3PublicBase && value.startsWith(`${s3PublicBase}/attachments/`)) return true;
  return false;
}

export function createApp(options: CreateAppOptions = {}) {
  const app = express();
  app.set('trust proxy', 1);

  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      frameguard: false,
    })
  );

  const allowedOrigins = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',').map((o) => o.trim()).filter(Boolean)
    : null;

  app.use(
    cors({
      origin: allowedOrigins && allowedOrigins.length > 0 ? allowedOrigins : true,
      credentials: true,
    })
  );

  app.use(cookieParser());
  app.use(express.json({ limit: '12mb' }));

  const noopMiddleware = (_req: Request, _res: Response, next: NextFunction) => next();

  const authActionLimiter = options.disableRateLimit
    ? noopMiddleware
    : rateLimit({
        windowMs: 15 * 60 * 1000,
        max: 60,
        standardHeaders: true,
        legacyHeaders: false,
        message: {
          code: 'RATE_LIMITED',
          error: 'Too many authentication attempts. Please wait a few minutes and try again.',
        },
      });
  const adWriteLimiter = options.disableRateLimit
    ? noopMiddleware
    : rateLimit({
        windowMs: 60 * 60 * 1000,
        max: 30,
        standardHeaders: true,
        legacyHeaders: false,
        message: { code: 'AD_RATE_LIMITED', error: 'Too many advertising actions. Please try again later.' },
      });
  const adEventLimiter = options.disableRateLimit
    ? noopMiddleware
    : rateLimit({
        windowMs: 60 * 60 * 1000,
        max: 300,
        standardHeaders: true,
        legacyHeaders: false,
        message: { code: 'AD_EVENT_RATE_LIMITED', error: 'Too many advertisement interactions. Try again later.' },
      });
  const linkPreviewLimiter = options.disableRateLimit
    ? noopMiddleware
    : rateLimit({
        windowMs: 60 * 1000,
        max: 30,
        standardHeaders: true,
        legacyHeaders: false,
        message: { code: 'PREVIEW_RATE_LIMITED', error: 'Too many preview requests. Try again shortly.' },
      });

  const avatarUpload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: MAX_AVATAR_BYTES,
      files: 1,
    },
  });

  const attachmentUpload = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: MAX_ATTACHMENT_BYTES,
      files: 1,
    },
  });
  const adImageUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 8 * 1024 * 1024, files: 1 },
  });

  // 1. Health & Database Connectivity Check
  app.get('/api/health', async (_req: Request, res: Response) => {
    try {
      const dbStatus = await checkDatabaseHealth();
      res.status(200).json({
        status: 'ok',
        database: 'connected',
        databaseProvider: dbStatus.provider,
        supabaseConfigured: isSupabaseConfigured(),
        storageDriver: isS3Configured()
          ? 's3'
          : isSupabaseConfigured()
          ? 'supabase'
          : 'postgresql-persistent',
        timestamp: new Date().toISOString(),
      });
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Health check failed';
      res.status(503).json({
        status: 'degraded',
        database: 'unavailable',
        error: msg,
        timestamp: new Date().toISOString(),
      });
    }
  });

  // 1b. Public Client Configuration & WebRTC ICE Servers
  app.get('/api/config', (_req: Request, res: Response) => {
    const supabaseUrl = process.env.SUPABASE_URL || '';
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || '';
    const turnUrls = process.env.TURN_URLS
      ? process.env.TURN_URLS.split(',').map((s) => s.trim()).filter(Boolean)
      : [];
    const turnUsername = process.env.TURN_USERNAME || '';
    const turnCredential = process.env.TURN_CREDENTIAL || '';

    const iceServers = [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:stun.cloudflare.com:3478' },
    ];

    if (turnUrls.length > 0) {
      iceServers.push({
        urls: turnUrls as unknown as string,
        ...(turnUsername ? { username: turnUsername } : {}),
        ...(turnCredential ? { credential: turnCredential } : {}),
      });

      app.post('/api/links/preview', requireSessionAuth, linkPreviewLimiter, async (req: AuthenticatedRequest, res: Response) => {
        try {
          const preview = await fetchSafeLinkPreview(req.body?.url);
          res.json(preview);
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Could not load website preview.';
          res.status(400).json({ code: 'LINK_PREVIEW_FAILED', error: message });
        }
      });
    }

    const googleMapsApiKey = process.env.GOOGLE_MAPS_API_KEY || process.env.VITE_GOOGLE_MAPS_API_KEY || '';

    res.json({
      supabaseUrl,
      supabaseAnonKey,
      googleMapsApiKey,
      iceServers,
      hasTurn: turnUrls.length > 0,
    });
  });

  // 2. Upload Profile Picture
  app.post(
    '/api/upload/avatar',
    authActionLimiter,
    (req: Request, res: Response, next: NextFunction) => {
      avatarUpload.single('avatar')(req, res, (err: unknown) => {
        if (err instanceof multer.MulterError) {
          if (err.code === 'LIMIT_FILE_SIZE') {
            res.status(400).json({
              code: 'FILE_TOO_LARGE',
              error: 'Profile picture must be 5 MB or smaller.',
            });
            return;
          }
          res.status(400).json({ code: 'UPLOAD_ERROR', error: err.message });
          return;
        }
        if (err) {
          res.status(400).json({ code: 'UPLOAD_ERROR', error: 'Invalid file upload.' });
          return;
        }
        next();
      });
    },
    async (req: Request, res: Response) => {
      try {
        if (!req.file || !req.file.buffer) {
          res.status(400).json({
            code: 'NO_FILE',
            error: 'Please select a JPG, PNG, or WebP image to upload.',
          });
          return;
        }

        const stored = await storeProfilePicture(req.file.buffer);
        res.status(201).json({
          url: stored.url,
          mimeType: stored.mimeType,
          byteSize: stored.byteSize,
          storageDriver: stored.storageDriver,
        });
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : 'Failed to upload profile picture.';
        res.status(400).json({
          code: 'INVALID_IMAGE',
          error: message,
        });
      }
    }
  );

  // 2b. Upload Chat Attachment (Images, Videos, Audio, Documents up to 25MB)
  app.post(
    '/api/upload/attachment',
    requireSessionAuth,
    (req: Request, res: Response, next: NextFunction) => {
      attachmentUpload.single('file')(req, res, (err: unknown) => {
        if (err instanceof multer.MulterError) {
          if (err.code === 'LIMIT_FILE_SIZE') {
            res.status(400).json({
              code: 'FILE_TOO_LARGE',
              error: 'Attachment must be 25 MB or smaller.',
            });
            return;
          }
          res.status(400).json({ code: 'UPLOAD_ERROR', error: err.message });
          return;
        }
        if (err) {
          res.status(400).json({ code: 'UPLOAD_ERROR', error: 'Invalid file upload.' });
          return;
        }
        next();
      });
    },
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        if (!req.file || !req.file.buffer) {
          res.status(400).json({
            code: 'NO_FILE',
            error: 'Please select a file to upload.',
          });
          return;
        }

        const stored = await storeSharedAttachment(
          req.file.buffer,
          req.file.originalname || 'attachment',
          req.file.mimetype
        );

        res.status(201).json({
          url: stored.url,
          fileName: stored.fileName,
          mimeType: stored.mimeType,
          byteSize: stored.byteSize,
          mediaType: stored.mediaType,
          storageDriver: stored.storageDriver,
        });
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : 'Failed to upload attachment.';
        res.status(400).json({
          code: 'UPLOAD_FAILED',
          error: message,
        });
      }
    }
  );

  app.post(
    '/api/upload/ad-image',
    requireSessionAuth,
    adWriteLimiter,
    (req: Request, res: Response, next: NextFunction) => {
      adImageUpload.single('file')(req, res, (err: unknown) => {
        if (err instanceof multer.MulterError) {
          res.status(400).json({ code: 'AD_IMAGE_UPLOAD_FAILED', error: 'Ad images must be 8 MB or smaller.' });
          return;
        }
        if (err) {
          res.status(400).json({ code: 'AD_IMAGE_UPLOAD_FAILED', error: 'Could not receive the ad image.' });
          return;
        }
        next();
      });
    },
    async (req: AuthenticatedRequest, res: Response) => {
      const buffer = req.file?.buffer;
      if (!buffer?.length) {
        res.status(400).json({ code: 'AD_IMAGE_REQUIRED', error: 'Select an advertisement image.' });
        return;
      }
      let mimeType: string | null = null;
      if (buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) mimeType = 'image/jpeg';
      else if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) mimeType = 'image/png';
      else if (['GIF87a', 'GIF89a'].includes(buffer.subarray(0, 6).toString('ascii'))) mimeType = 'image/gif';
      else if (buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') mimeType = 'image/webp';
      if (!mimeType) {
        res.status(400).json({ code: 'INVALID_AD_IMAGE', error: 'Only valid JPG, PNG, GIF, or WebP images are allowed.' });
        return;
      }
      try {
        const stored = await storeSharedAttachment(
          buffer,
          req.file?.originalname || 'advertisement',
          mimeType
        );
        res.status(201).json({ url: stored.url, mimeType, byteSize: stored.byteSize });
      } catch (error) {
        console.error('Error in POST /api/upload/ad-image:', error);
        res.status(500).json({ code: 'AD_IMAGE_UPLOAD_FAILED', error: 'Could not store the advertisement image.' });
      }
    }
  );

  // 3. Serve Persistent Media Objects
  app.get('/api/media/:objectKey', async (req: Request, res: Response) => {
    try {
      const objectKey = String(req.params.objectKey || '').replace(/[^a-zA-Z0-9._-]/g, '');
      if (!objectKey) {
        res.status(400).json({ error: 'Invalid media key.' });
        return;
      }

      const media = await getStoredMediaByKey(objectKey);
      if (!media) {
        res.status(404).json({ error: 'Media not found.' });
        return;
      }

      res.setHeader('Content-Type', media.mimeType);
      res.setHeader('Content-Length', String(media.buffer.length));
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      res.setHeader('Content-Security-Policy', "default-src 'none'");
      res.status(200).send(media.buffer);
    } catch {
      res.status(500).json({ error: 'Failed to load image.' });
    }
  });

  // 4. Direct Lifetime Account Signup (Mobile Number + Password)
  app.post('/api/auth/signup', authActionLimiter, async (req: Request, res: Response) => {
    try {
      const {
        fullName,
        phone,
        countryIso = 'IN',
        dialCode = '+91',
        password,
        avatarUrl,
      } = req.body as {
        fullName?: string;
        phone?: string;
        countryIso?: string;
        dialCode?: string;
        password?: string;
        avatarUrl?: string | null;
      };

      const trimmedName = (fullName || '').trim();
      if (trimmedName.length < 2 || trimmedName.length > 80) {
        res.status(400).json({
          code: 'INVALID_NAME',
          error: 'Full name must be between 2 and 80 characters.',
        });
        return;
      }

      const rawPassword = typeof password === 'string' ? password : '';
      if (rawPassword.length < 6 || rawPassword.length > 128) {
        res.status(400).json({
          code: 'INVALID_PASSWORD',
          error: 'Password must be at least 6 characters long.',
        });
        return;
      }

      const normalizedPhone = normalizeAndValidatePhone(
        phone || '',
        (countryIso || 'IN') as CountryCode,
        dialCode
      );
      if (!normalizedPhone.valid || !normalizedPhone.e164) {
        res.status(400).json({
          code: 'INVALID_PHONE',
          error: normalizedPhone.error || 'Please enter a valid mobile number.',
        });
        return;
      }

      const safeAvatarUrl =
        typeof avatarUrl === 'string' && avatarUrl.trim().length > 0
          ? avatarUrl.trim()
          : null;

      const { user, rawSessionToken, recoveryKey } = await registerUserDirect({
        phoneNormalized: normalizedPhone.e164,
        countryCode: normalizedPhone.countryCallingCode || dialCode,
        fullName: trimmedName,
        password: rawPassword,
        avatarUrl: safeAvatarUrl,
        userAgent: req.headers['user-agent'],
        ipAddress: req.ip,
      });

      setSessionCookie(req, res, rawSessionToken);

      res.status(201).json({
        user: toPublicUser(user),
        sessionToken: rawSessionToken,
        recoveryKey,
        chatState: null,
      });
    } catch (error: unknown) {
      if (error instanceof AppDomainError) {
        res.status(error.statusCode).json({
          code: error.code,
          error: error.message,
        });
        return;
      }
      console.error('Error in POST /api/auth/signup:', error);
      res.status(500).json({
        code: 'SIGNUP_FAILED',
        error: 'Unable to complete signup right now. Please try again.',
      });
    }
  });

  // 5. Login with Mobile Number & Password
  app.post('/api/auth/login', authActionLimiter, async (req: Request, res: Response) => {
    try {
      const {
        phone,
        countryIso = 'IN',
        dialCode = '+91',
        password,
      } = req.body as {
        phone?: string;
        countryIso?: string;
        dialCode?: string;
        password?: string;
      };

      const normalizedPhone = normalizeAndValidatePhone(
        phone || '',
        (countryIso || 'IN') as CountryCode,
        dialCode
      );
      if (!normalizedPhone.valid || !normalizedPhone.e164) {
        res.status(400).json({
          code: 'INVALID_PHONE',
          error: normalizedPhone.error || 'Please enter a valid mobile number.',
        });
        return;
      }

      const rawPassword = typeof password === 'string' ? password : '';
      if (rawPassword.length < 6) {
        res.status(400).json({
          code: 'PASSWORD_REQUIRED',
          error: 'Please enter your account password (minimum 6 characters).',
        });
        return;
      }

      const { user, rawSessionToken } = await loginUserByMobile({
        phoneNormalized: normalizedPhone.e164,
        password: rawPassword,
        userAgent: req.headers['user-agent'],
        ipAddress: req.ip,
      });

      setSessionCookie(req, res, rawSessionToken);

      res.status(200).json({
        user: toPublicUser(user),
        sessionToken: rawSessionToken,
        chatState: parseSavedChatState(user.chatStateJson),
      });
    } catch (error: unknown) {
      if (error instanceof AppDomainError) {
        res.status(error.statusCode).json({
          code: error.code,
          error: error.message,
        });
        return;
      }
      console.error('Error in POST /api/auth/login:', error);
      res.status(500).json({
        code: 'LOGIN_FAILED',
        error: 'Unable to log in right now. Please try again.',
      });
    }
  });

  // 6. Safe Account & Password Recovery
  app.post('/api/auth/recover', authActionLimiter, async (req: Request, res: Response) => {
    try {
      const {
        oldPhone,
        oldCountryIso = 'IN',
        oldDialCode = '+91',
        recoveryKey,
        firebaseIdToken,
        newPhone,
        newCountryIso = 'IN',
        newDialCode = '+91',
        newPassword,
      } = req.body as {
        oldPhone?: string;
        oldCountryIso?: string;
        oldDialCode?: string;
        recoveryKey?: string;
        firebaseIdToken?: string;
        newPhone?: string;
        newCountryIso?: string;
        newDialCode?: string;
        newPassword?: string;
      };

      const oldNorm = normalizeAndValidatePhone(
        oldPhone || '',
        (oldCountryIso || 'IN') as CountryCode,
        oldDialCode
      );
      const effectiveNewPhone = (newPhone || '').trim() ? newPhone || '' : oldPhone || '';
      const effectiveNewIso = (newPhone || '').trim() ? newCountryIso : oldCountryIso;
      const effectiveNewDial = (newPhone || '').trim() ? newDialCode : oldDialCode;

      const newNorm = normalizeAndValidatePhone(
        effectiveNewPhone,
        (effectiveNewIso || 'IN') as CountryCode,
        effectiveNewDial
      );

      if (!oldNorm.valid || !oldNorm.e164 || !newNorm.valid || !newNorm.e164) {
        res.status(400).json({
          code: 'INVALID_PHONE',
          error: 'Please enter valid mobile number(s).',
        });
        return;
      }

      if (newPassword !== undefined && newPassword.length > 0 && newPassword.length < 6) {
        res.status(400).json({
          code: 'INVALID_PASSWORD',
          error: 'New password must be at least 6 characters long.',
        });
        return;
      }

      const decodedFirebase = await verifyOptionalFirebaseIdToken(firebaseIdToken);
      if (!recoveryKey?.trim() && !decodedFirebase?.uid) {
        res.status(401).json({
          code: 'RECOVERY_CREDENTIALS_REQUIRED',
          error:
            'Provide your ZOLO Recovery Key or sign in with your linked Google recovery account.',
        });
        return;
      }

      const { user, rawSessionToken, newRecoveryKey } = await recoverAccountDirect({
        oldPhoneNormalized: oldNorm.e164,
        recoveryKey: recoveryKey?.trim(),
        verifiedFirebaseUid: decodedFirebase?.uid,
        newPhoneNormalized: newNorm.e164,
        newCountryCode: newNorm.countryCallingCode || effectiveNewDial,
        newPassword: newPassword && newPassword.length >= 6 ? newPassword : undefined,
        userAgent: req.headers['user-agent'],
        ipAddress: req.ip,
      });

      setSessionCookie(req, res, rawSessionToken);

      res.status(200).json({
        user: toPublicUser(user),
        sessionToken: rawSessionToken,
        recoveryKey: newRecoveryKey,
        chatState: parseSavedChatState(user.chatStateJson),
      });
    } catch (error: unknown) {
      if (error instanceof AppDomainError) {
        res.status(error.statusCode).json({
          code: error.code,
          error: error.message,
        });
        return;
      }
      console.error('Error in POST /api/auth/recover:', error);
      res.status(500).json({
        code: 'RECOVERY_FAILED',
        error: 'Unable to recover account right now.',
      });
    }
  });

  // 7. Get Current Authenticated Account
  app.get('/api/account/me', requireSessionAuth, (req: AuthenticatedRequest, res: Response) => {
    const user = req.authUser!;
    res.json({
      user: toPublicUser(user),
      currentSessionId: req.authSession!.sessionId,
      chatState: parseSavedChatState(user.chatStateJson),
    });
  });

  // 8. Update User Profile
  app.patch(
    '/api/account/profile',
    requireSessionAuth,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { fullName, about, avatarUrl } = req.body as {
          fullName?: string;
          about?: string;
          avatarUrl?: string | null;
        };

        if (fullName !== undefined && (fullName.trim().length < 2 || fullName.trim().length > 80)) {
          res.status(400).json({
            code: 'INVALID_NAME',
            error: 'Full name must be between 2 and 80 characters.',
          });
          return;
        }

        const updated = await updateUserProfileRecord(req.authUser!.id, {
          fullName,
          about,
          avatarUrl,
        });

        res.json({ user: toPublicUser(updated) });
      } catch (error: unknown) {
        if (error instanceof AppDomainError) {
          res.status(error.statusCode).json({ code: error.code, error: error.message });
          return;
        }
        res.status(500).json({ code: 'PROFILE_UPDATE_FAILED', error: 'Failed to update profile.' });
      }
    }
  );

  // 9. Change Mobile Number Directly
  app.post(
    '/api/account/phone/change',
    requireSessionAuth,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const {
          newPhone,
          countryIso = 'IN',
          dialCode = '+91',
        } = req.body as {
          newPhone?: string;
          countryIso?: string;
          dialCode?: string;
        };

        const normalized = normalizeAndValidatePhone(
          newPhone || '',
          (countryIso || 'IN') as CountryCode,
          dialCode
        );
        if (!normalized.valid || !normalized.e164) {
          res.status(400).json({
            code: 'INVALID_PHONE',
            error: normalized.error || 'Please enter a valid new mobile number.',
          });
          return;
        }

        const updatedUser = await changePhoneNumberDirect({
          userId: req.authUser!.id,
          currentSessionId: req.authSession!.sessionId,
          newPhoneNormalized: normalized.e164,
          newCountryCode: normalized.countryCallingCode || dialCode,
        });

        res.json({ user: toPublicUser(updatedUser) });
      } catch (error: unknown) {
        if (error instanceof AppDomainError) {
          res.status(error.statusCode).json({ code: error.code, error: error.message });
          return;
        }
        res.status(500).json({
          code: 'PHONE_CHANGE_FAILED',
          error: 'Failed to update mobile number.',
        });
      }
    }
  );

  // 10. Link Google Account for Recovery
  app.post(
    '/api/account/link-google',
    requireSessionAuth,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { firebaseIdToken } = req.body as { firebaseIdToken?: string };
        const decoded = await verifyOptionalFirebaseIdToken(firebaseIdToken);
        if (!decoded) {
          res.status(401).json({
            code: 'INVALID_GOOGLE_TOKEN',
            error: 'Could not verify Google authentication token.',
          });
          return;
        }

        const updated = await linkFirebaseGoogleForRecovery({
          userId: req.authUser!.id,
          firebaseUid: decoded.uid,
          email: decoded.email ?? null,
        });

        res.json({ user: toPublicUser(updated) });
      } catch (error: unknown) {
        if (error instanceof AppDomainError) {
          res.status(error.statusCode).json({ code: error.code, error: error.message });
          return;
        }
        res.status(500).json({
          code: 'GOOGLE_LINK_FAILED',
          error: 'Failed to link Google recovery account.',
        });
      }
    }
  );

  // 11. Sync Persistent Chat State
  app.put(
    '/api/account/chat-state',
    requireSessionAuth,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { chatState } = req.body as { chatState?: unknown };
        if (!chatState || typeof chatState !== 'object') {
          res
            .status(400)
            .json({ code: 'INVALID_CHAT_STATE', error: 'Invalid chat state payload.' });
          return;
        }
        await saveUserChatState(req.authUser!.id, JSON.stringify(chatState));
        res.json({ saved: true });
      } catch {
        res.status(500).json({ code: 'CHAT_SYNC_FAILED', error: 'Failed to save chat state.' });
      }
    }
  );

  // 11b. Categories, Themes, and Ringtone Customizations
  app.get('/api/categories', requireSessionAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const data = await fetchUserCategoriesAndMap(req.authUser!.phoneNormalized);
      res.json(data);
    } catch {
      res.status(500).json({ code: 'CATEGORIES_FETCH_FAILED', error: 'Failed to fetch categories.' });
    }
  });

  app.post('/api/categories', requireSessionAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { name, color, icon } = req.body as { name?: string; color?: string; icon?: string };
      if (!name || !name.trim()) {
        res.status(400).json({ code: 'NAME_REQUIRED', error: 'Category name is required.' });
        return;
      }
      const category = await createCustomCategory({
        userPhone: req.authUser!.phoneNormalized,
        name,
        color,
        icon,
      });
      res.status(201).json({ category });
    } catch {
      res.status(500).json({ code: 'CATEGORY_CREATE_FAILED', error: 'Failed to create category.' });
    }
  });

  app.patch('/api/categories/:id', requireSessionAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { name, color } = req.body as { name?: string; color?: string };
      await updateCustomCategory({
        userPhone: req.authUser!.phoneNormalized,
        categoryId: req.params.id,
        name,
        color,
      });
      res.json({ success: true });
    } catch {
      res.status(500).json({ code: 'CATEGORY_UPDATE_FAILED', error: 'Failed to update category.' });
    }
  });

  app.delete('/api/categories/:id', requireSessionAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      await deleteCustomCategory(req.authUser!.phoneNormalized, req.params.id);
      res.json({ success: true });
    } catch {
      res.status(500).json({ code: 'CATEGORY_DELETE_FAILED', error: 'Failed to delete category.' });
    }
  });

  app.post('/api/categories/assign', requireSessionAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { conversationId, categoryIds } = req.body as { conversationId?: string; categoryIds?: string[] };
      if (!conversationId) {
        res.status(400).json({ code: 'CONVERSATION_ID_REQUIRED', error: 'Conversation ID required.' });
        return;
      }
      const result = await saveChatCategoryAssignments({
        userPhone: req.authUser!.phoneNormalized,
        conversationId,
        categoryIds: Array.isArray(categoryIds) ? categoryIds : [],
      });
      res.json(result);
    } catch {
      res.status(500).json({ code: 'CATEGORY_ASSIGN_FAILED', error: 'Failed to assign categories.' });
    }
  });

  // Individual Chat Themes
  app.get('/api/themes', requireSessionAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const themes = await fetchUserChatThemes(req.authUser!.phoneNormalized);
      res.json({ themes });
    } catch {
      res.status(500).json({ code: 'THEMES_FETCH_FAILED', error: 'Failed to fetch themes.' });
    }
  });

  app.put('/api/themes/:conversationId', requireSessionAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { theme } = req.body as { theme?: unknown };
      if (!theme || typeof theme !== 'object') {
        res.status(400).json({ code: 'INVALID_THEME', error: 'Theme config required.' });
        return;
      }
      const result = await saveUserChatTheme({
        userPhone: req.authUser!.phoneNormalized,
        conversationId: req.params.conversationId,
        theme: theme as any,
      });
      res.json(result);
    } catch {
      res.status(500).json({ code: 'THEME_SAVE_FAILED', error: 'Failed to save theme.' });
    }
  });

  app.delete('/api/themes/:conversationId', requireSessionAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      await deleteUserChatTheme(req.authUser!.phoneNormalized, req.params.conversationId);
      res.json({ success: true });
    } catch {
      res.status(500).json({ code: 'THEME_DELETE_FAILED', error: 'Failed to reset theme.' });
    }
  });

  // Ringtone Settings
  app.get('/api/ringtones', requireSessionAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const settings = await fetchUserRingtoneSettings(req.authUser!.phoneNormalized);
      res.json({ settings });
    } catch {
      res.status(500).json({ code: 'RINGTONES_FETCH_FAILED', error: 'Failed to fetch ringtones.' });
    }
  });

  app.put('/api/ringtones', requireSessionAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { settings } = req.body as { settings?: Record<string, unknown> };
      const updated = await saveUserRingtoneSettings(req.authUser!.phoneNormalized, settings || {});
      res.json({ settings: updated });
    } catch {
      res.status(500).json({ code: 'RINGTONES_SAVE_FAILED', error: 'Failed to save ringtone settings.' });
    }
  });

  // =========================================================================
  // REAL ZOLO CONTACT DISCOVERY & REAL USER-TO-USER MESSAGING ENDPOINTS
  // =========================================================================

  // 12. Look up a mobile number (or batch of numbers) to check ZOLO registration & live presence
  app.post(
    '/api/contacts/lookup',
    requireSessionAuth,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const {
          phone,
          countryIso = 'IN',
          dialCode = '+91',
          phones,
        } = req.body as {
          phone?: string;
          countryIso?: string;
          dialCode?: string;
          phones?: string[];
        };

        // Batch lookup mode
        if (Array.isArray(phones)) {
          const normalizedMap = new Map<string, string>();
          for (const raw of phones) {
            const norm = normalizeAndValidatePhone(
              String(raw || ''),
              (countryIso || 'IN') as CountryCode,
              dialCode
            );
            if (norm.valid && norm.e164) {
              normalizedMap.set(raw, norm.e164);
            }
          }

          const uniqueE164 = Array.from(new Set(normalizedMap.values()));
          const profiles = await lookupRegisteredUsersByPhones(uniqueE164);
          const profileByPhone = new Map(profiles.map((p) => [p.phoneNormalized, p]));

          const results = uniqueE164.map((e164) => {
            const prof = profileByPhone.get(e164) || null;
            const presence = realtimeHub.getPresence(e164);
            return {
              phoneNormalized: e164,
              isRegistered: Boolean(prof),
              user: prof,
              online: prof ? presence.online : false,
              lastSeen: prof ? presence.lastSeen : 'Not registered on ZOLO yet',
            };
          });

          res.json({ contacts: results });
          return;
        }

        // Single phone lookup mode
        const norm = normalizeAndValidatePhone(
          phone || '',
          (countryIso || 'IN') as CountryCode,
          dialCode
        );
        if (!norm.valid || !norm.e164) {
          res.status(400).json({
            code: 'INVALID_PHONE',
            error: norm.error || 'Please enter a valid mobile number.',
          });
          return;
        }

        const profiles = await lookupRegisteredUsersByPhones([norm.e164]);
        const found = profiles[0] || null;
        const presence = realtimeHub.getPresence(norm.e164);

        res.json({
          phoneNormalized: norm.e164,
          isRegistered: Boolean(found),
          user: found,
          online: found ? presence.online : false,
          lastSeen: found ? presence.lastSeen : 'Invite or message — delivers when they join ZOLO',
        });
      } catch (error) {
        console.error('Error in POST /api/contacts/lookup:', error);
        res.status(500).json({
          code: 'CONTACT_LOOKUP_FAILED',
          error: 'Could not look up mobile number.',
        });
      }
    }
  );

  // 13. Search registered ZOLO users by mobile number or name
  app.get(
    '/api/contacts/search',
    requireSessionAuth,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const q = String(req.query.q || '').trim();
        if (q.length < 2) {
          res.json({ users: [] });
          return;
        }

        const matches = await searchRegisteredUsers(q, req.authUser!.phoneNormalized);
        const enriched = matches.map((u) => {
          const presence = realtimeHub.getPresence(u.phoneNormalized);
          return {
            ...u,
            online: presence.online,
            lastSeen: presence.lastSeen,
          };
        });

        res.json({ users: enriched });
      } catch (error) {
        console.error('Error in GET /api/contacts/search:', error);
        res.status(500).json({ code: 'SEARCH_FAILED', error: 'Failed to search ZOLO directory.' });
      }
    }
  );

  // 14. Fetch User's Real Direct Message Inbox & Mark Newly Received Messages Delivered
  app.get(
    '/api/messages/inbox',
    requireSessionAuth,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const myPhone = req.authUser!.phoneNormalized;

        // Mark any 'sent' messages addressed to me as 'delivered' and notify online senders
        const deliveredReceipts = await markUndeliveredMessagesDelivered(myPhone);
        for (const receipt of deliveredReceipts) {
          realtimeHub.sendToPhone(receipt.senderPhone, {
            type: 'message:status',
            peerPhone: myPhone,
            messageIds: receipt.messageIds,
            status: 'delivered',
          });
        }

        const [{ messages, peers }, groupInbox] = await Promise.all([
          fetchUserDirectMessagesAndPeers(myPhone),
          fetchGroupInboxForUser(myPhone),
        ]);
        const enrichedPeers = peers.map((p) => {
          const presence = realtimeHub.getPresence(p.phoneNormalized);
          return {
            ...p,
            online: presence.online,
            lastSeen: presence.lastSeen,
          };
        });

        res.json({
          messages,
          peers: enrichedPeers,
          groups: groupInbox.groups,
          groupMessages: groupInbox.messages,
        });
      } catch (error) {
        console.error('Error in GET /api/messages/inbox:', error);
        res.status(500).json({
          code: 'INBOX_FETCH_FAILED',
          error: 'Failed to load real messages.',
        });
      }
    }
  );

  app.post('/api/groups', requireSessionAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { name, description = '', avatarUrl = null, memberPhones = [] } = req.body as {
        name?: string;
        description?: string;
        avatarUrl?: string | null;
        memberPhones?: unknown;
      };
      const safeName = typeof name === 'string' ? name.trim() : '';
      if (safeName.length < 2 || safeName.length > 80) {
        res.status(400).json({ code: 'INVALID_GROUP_NAME', error: 'Group name must be between 2 and 80 characters.' });
        return;
      }
      if (!Array.isArray(memberPhones) || memberPhones.length < 1 || memberPhones.length > 99) {
        res.status(400).json({ code: 'INVALID_GROUP_MEMBERS', error: 'Select between 1 and 99 group members.' });
        return;
      }
      if (typeof description !== 'string' || description.length > 500) {
        res.status(400).json({ code: 'INVALID_GROUP_DESCRIPTION', error: 'Group description must be 500 characters or fewer.' });
        return;
      }
      if (avatarUrl !== null && (typeof avatarUrl !== 'string' || avatarUrl.length > 2048)) {
        res.status(400).json({ code: 'INVALID_GROUP_AVATAR', error: 'Group photo URL is invalid.' });
        return;
      }

      const normalizedPhones = new Set<string>();
      for (const rawPhone of memberPhones) {
        if (typeof rawPhone !== 'string') {
          res.status(400).json({ code: 'INVALID_GROUP_MEMBER', error: 'A selected member has an invalid phone number.' });
          return;
        }
        const normalized = normalizeAndValidatePhone(rawPhone, 'IN', '+91');
        if (!normalized.valid || !normalized.e164) {
          res.status(400).json({ code: 'INVALID_GROUP_MEMBER', error: 'A selected member has an invalid phone number.' });
          return;
        }
        if (normalized.e164 !== req.authUser!.phoneNormalized) normalizedPhones.add(normalized.e164);
      }
      const requestedPhones = Array.from(normalizedPhones);
      const knownUsers = await lookupRegisteredUsersByPhones(requestedPhones);
      if (knownUsers.length !== requestedPhones.length) {
        res.status(400).json({ code: 'UNKNOWN_GROUP_MEMBER', error: 'All group members must be registered ZOLO users.' });
        return;
      }

      const group = await createGroupInDb({
        id: `group_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`,
        name: safeName,
        description: description.trim(),
        avatarUrl: typeof avatarUrl === 'string' ? avatarUrl : null,
        createdBy: req.authUser!.phoneNormalized,
        memberPhones: requestedPhones,
      });
      realtimeHub.sendToPhones(group.memberPhones, { type: 'group:created', group });
      res.status(201).json({ group });
    } catch (error) {
      console.error('Error in POST /api/groups:', error);
      res.status(500).json({ code: 'GROUP_CREATE_FAILED', error: 'Failed to create group.' });
    }
  });

  app.post(
    '/api/groups/:groupId/messages',
    requireSessionAuth,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const sender = req.authUser!;
        const groupId = String(req.params.groupId || '').trim();
        if (!groupId || !(await isGroupMember(groupId, sender.phoneNormalized))) {
          res.status(404).json({ code: 'GROUP_NOT_FOUND', error: 'Group not found.' });
          return;
        }
        const {
          text = '',
          mediaType = 'text',
          payload = {},
        } = req.body as {
          text?: string;
          mediaType?: DirectMessageDto['mediaType'];
          payload?: MessageRichPayload;
        };
        const supportedTypes: DirectMessageDto['mediaType'][] = [
          'text', 'image', 'video', 'audio', 'document', 'location', 'poll',
        ];
        if (typeof text !== 'string' || text.length > 10000 || !supportedTypes.includes(mediaType)) {
          res.status(400).json({ code: 'INVALID_GROUP_MESSAGE', error: 'Group message content is invalid.' });
          return;
        }

        const message = await saveGroupMessage({
          groupId,
          senderPhone: sender.phoneNormalized,
          senderName: sender.fullName,
          senderAvatar: sender.avatarUrl ?? null,
          text,
          mediaType,
          payload: payload && typeof payload === 'object' ? payload : {},
        });
        const inbox = await fetchGroupInboxForUser(sender.phoneNormalized);
        const group = inbox.groups.find((item) => item.id === groupId);
        if (!group) {
          res.status(404).json({ code: 'GROUP_NOT_FOUND', error: 'Group not found.' });
          return;
        }
        realtimeHub.sendToPhones(group.memberPhones, { type: 'group:message', message });
        res.status(201).json({ message });
      } catch (error) {
        console.error('Error in POST /api/groups/:groupId/messages:', error);
        res.status(500).json({ code: 'GROUP_MESSAGE_FAILED', error: 'Failed to send group message.' });
      }
    }
  );

  // 15. Send a Real Message to Another ZOLO Mobile Number
  app.post(
    '/api/messages/send',
    requireSessionAuth,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const sender = req.authUser!;
        const {
          messageId,
          recipientPhone,
          countryIso = 'IN',
          dialCode = '+91',
          text = '',
          mediaType = 'text',
          payload = {},
        } = req.body as {
          messageId?: string;
          recipientPhone?: string;
          countryIso?: string;
          dialCode?: string;
          text?: string;
          mediaType?: DirectMessageDto['mediaType'];
          payload?: MessageRichPayload;
        };

        const normRecipient = normalizeAndValidatePhone(
          recipientPhone || '',
          (countryIso || 'IN') as CountryCode,
          dialCode
        );
        if (!normRecipient.valid || !normRecipient.e164) {
          res.status(400).json({
            code: 'INVALID_RECIPIENT_PHONE',
            error: normRecipient.error || 'Recipient mobile number is invalid.',
          });
          return;
        }

        const safeMessageId =
          typeof messageId === 'string' && messageId.trim().length > 4
            ? messageId.trim()
            : `dm_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;

        const targetPhone = normRecipient.e164;
        const isSelf = targetPhone === sender.phoneNormalized;
        const isRecipientOnline = !isSelf && realtimeHub.isPhoneOnline(targetPhone);

        const initialStatus: DirectMessageDto['status'] = isSelf
          ? 'read'
          : isRecipientOnline
          ? 'delivered'
          : 'sent';

        const savedMessage = await saveDirectMessage({
          messageId: safeMessageId,
          senderPhone: sender.phoneNormalized,
          senderName: sender.fullName,
          senderAvatar: sender.avatarUrl ?? null,
          recipientPhone: targetPhone,
          text: String(text || ''),
          mediaType,
          payload: payload || {},
          initialStatus,
        });

        const senderProfile = {
          uid: sender.uid,
          phoneNormalized: sender.phoneNormalized,
          fullName: sender.fullName,
          about: sender.about,
          avatarUrl: sender.avatarUrl ?? null,
        };

        // Push to recipient's connected devices immediately
        if (!isSelf) {
          realtimeHub.sendToPhone(targetPhone, {
            type: 'message:new',
            message: savedMessage,
            senderProfile,
          });
        }

        // Also sync to sender's other active tabs/devices
        realtimeHub.sendToPhone(sender.phoneNormalized, {
          type: 'message:new',
          message: savedMessage,
          senderProfile,
        });

        const recipientProfiles = await lookupRegisteredUsersByPhones([targetPhone]);
        const recipientProfile = recipientProfiles[0] || null;
        const presence = realtimeHub.getPresence(targetPhone);

        res.status(201).json({
          message: savedMessage,
          recipientRegistered: Boolean(recipientProfile),
          recipientProfile: recipientProfile
            ? {
                ...recipientProfile,
                online: presence.online,
                lastSeen: presence.lastSeen,
              }
            : null,
        });
      } catch (error) {
        console.error('Error in POST /api/messages/send:', error);
        res.status(500).json({
          code: 'MESSAGE_SEND_FAILED',
          error: 'Failed to send message. Please try again.',
        });
      }
    }
  );

  // 16. Mark Incoming Messages from Peer as Read (Triggers Blue Ticks for Sender)
  app.post(
    '/api/messages/read',
    requireSessionAuth,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const myPhone = req.authUser!.phoneNormalized;
        const { peerPhone } = req.body as { peerPhone?: string };
        const normPeer = normalizeAndValidatePhone(peerPhone || '', 'IN', '+91');
        if (!normPeer.valid || !normPeer.e164) {
          res.status(400).json({ code: 'INVALID_PHONE', error: 'Invalid peer phone number.' });
          return;
        }

        const updatedIds = await markConversationReadInDb(myPhone, normPeer.e164);
        if (updatedIds.length > 0) {
          realtimeHub.sendToPhone(normPeer.e164, {
            type: 'message:status',
            peerPhone: myPhone,
            messageIds: updatedIds,
            status: 'read',
          });
        }

        res.json({ updatedCount: updatedIds.length, messageIds: updatedIds });
      } catch (error) {
        console.error('Error in POST /api/messages/read:', error);
        res.status(500).json({ code: 'READ_RECEIPT_FAILED', error: 'Failed to mark read.' });
      }
    }
  );

  // 17. Toggle Reaction on a Real Direct Message
  app.patch(
    '/api/messages/:messageId/react',
    requireSessionAuth,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const actor = req.authUser!;
        const messageId = String(req.params.messageId || '').trim();
        const { emoji } = req.body as { emoji?: string };
        if (!messageId || !emoji) {
          res.status(400).json({ code: 'INVALID_REACTION', error: 'Emoji is required.' });
          return;
        }

        const updated = await toggleMessageReactionInDb({
          messageId,
          actorPhone: actor.phoneNormalized,
          actorName: actor.fullName,
          emoji: String(emoji).slice(0, 8),
        });

        if (!updated) {
          res.status(404).json({ code: 'MESSAGE_NOT_FOUND', error: 'Message not found.' });
          return;
        }

        realtimeHub.sendToPhone(updated.senderPhone, {
          type: 'message:updated',
          message: updated,
        });
        if (updated.recipientPhone !== updated.senderPhone) {
          realtimeHub.sendToPhone(updated.recipientPhone, {
            type: 'message:updated',
            message: updated,
          });
        }

        res.json({ message: updated });
      } catch (error) {
        console.error('Error in PATCH /api/messages/:messageId/react:', error);
        res.status(500).json({ code: 'REACTION_FAILED', error: 'Failed to update reaction.' });
      }
    }
  );

  // 18. Vote on a Poll in a Real Direct Message
  app.patch(
    '/api/messages/:messageId/poll-vote',
    requireSessionAuth,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const actor = req.authUser!;
        const messageId = String(req.params.messageId || '').trim();
        const { optionId } = req.body as { optionId?: string };
        if (!messageId || !optionId) {
          res.status(400).json({ code: 'INVALID_VOTE', error: 'Poll option ID is required.' });
          return;
        }

        const updated = await voteMessagePollInDb({
          messageId,
          actorPhone: actor.phoneNormalized,
          voterName: actor.fullName,
          optionId: String(optionId),
        });

        if (!updated) {
          res.status(404).json({ code: 'MESSAGE_NOT_FOUND', error: 'Poll message not found.' });
          return;
        }

        realtimeHub.sendToPhone(updated.senderPhone, {
          type: 'message:updated',
          message: updated,
        });
        if (updated.recipientPhone !== updated.senderPhone) {
          realtimeHub.sendToPhone(updated.recipientPhone, {
            type: 'message:updated',
            message: updated,
          });
        }

        res.json({ message: updated });
      } catch (error) {
        console.error('Error in PATCH /api/messages/:messageId/poll-vote:', error);
        res.status(500).json({ code: 'POLL_VOTE_FAILED', error: 'Failed to record poll vote.' });
      }
    }
  );

  // 19. Delete a Real Direct Message
  app.delete(
    '/api/messages/:messageId',
    requireSessionAuth,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const actor = req.authUser!;
        const messageId = String(req.params.messageId || '').trim();
        if (!messageId) {
          res.status(400).json({ code: 'INVALID_ID', error: 'Message ID is required.' });
          return;
        }

        const deleted = await deleteDirectMessageInDb(messageId, actor.phoneNormalized);
        if (!deleted) {
          res.status(404).json({ code: 'MESSAGE_NOT_FOUND', error: 'Message not found.' });
          return;
        }

        realtimeHub.sendToPhone(deleted.senderPhone, {
          type: 'message:deleted',
          ...deleted,
        });
        if (deleted.recipientPhone !== deleted.senderPhone) {
          realtimeHub.sendToPhone(deleted.recipientPhone, {
            type: 'message:deleted',
            ...deleted,
          });
        }

        res.json({ deleted: true });
      } catch (error) {
        console.error('Error in DELETE /api/messages/:messageId:', error);
        res.status(500).json({ code: 'DELETE_FAILED', error: 'Failed to delete message.' });
      }
    }
  );

  // =========================================================================
  // SHARED 24-HOUR STATUS STORIES & REAL INTERNET CALL LOGS ENDPOINTS
  // =========================================================================

  // 19b. Change Account Password
  app.post(
    '/api/account/password',
    requireSessionAuth,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { currentPassword, newPassword } = req.body as {
          currentPassword?: string;
          newPassword?: string;
        };
        if (!newPassword || newPassword.length < 6 || newPassword.length > 128) {
          res.status(400).json({
            code: 'INVALID_PASSWORD',
            error: 'New password must be at least 6 characters long.',
          });
          return;
        }
        const updated = await changeAccountPassword({
          userId: req.authUser!.id,
          currentPassword,
          newPassword,
        });
        res.json({ user: toPublicUser(updated) });
      } catch (error: unknown) {
        if (error instanceof AppDomainError) {
          res.status(error.statusCode).json({ code: error.code, error: error.message });
          return;
        }
        res.status(500).json({ code: 'PASSWORD_UPDATE_FAILED', error: 'Failed to update password.' });
      }
    }
  );

  // 19c. Fetch Visible 24h Status Stories from Contacts in User's Chats
  app.post(
    '/api/statuses/feed',
    requireSessionAuth,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const myPhone = req.authUser!.phoneNormalized;
        const { contactPhones = [] } = req.body as { contactPhones?: string[] };

        const normalizedList: string[] = [];
        if (Array.isArray(contactPhones)) {
          for (const raw of contactPhones) {
            const norm = normalizeAndValidatePhone(String(raw || ''), 'IN', '+91');
            if (norm.valid && norm.e164) {
              normalizedList.push(norm.e164);
            }
          }
        }

        const stories = await fetchVisibleStatusStories({
          viewerPhone: myPhone,
          contactPhones: normalizedList,
        });

        res.json({ stories });
      } catch (error) {
        console.error('Error in POST /api/statuses/feed:', error);
        res.status(500).json({ code: 'STATUS_FEED_FAILED', error: 'Failed to load statuses.' });
      }
    }
  );

  // 19d. Publish a New Status Story (Broadcasts Live to Connected Users Who Have Author in Chats)
  app.post(
    '/api/statuses',
    requireSessionAuth,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const author = req.authUser!;
        const {
          storyId,
          storyType = 'text',
          textContent,
          mediaUrl,
          caption,
          bgColor,
        } = req.body as {
          storyId?: string;
          storyType?: 'text' | 'image' | 'video';
          textContent?: string;
          mediaUrl?: string;
          caption?: string;
          bgColor?: string;
        };

        const type = storyType === 'image' || storyType === 'video' ? storyType : 'text';
        if (type === 'text' && (!textContent || !textContent.trim())) {
          res.status(400).json({ code: 'EMPTY_STATUS', error: 'Status text cannot be empty.' });
          return;
        }
        if (type !== 'text' && (!mediaUrl || !mediaUrl.trim())) {
          res.status(400).json({ code: 'EMPTY_STATUS_MEDIA', error: 'Status media is required.' });
          return;
        }

        const safeStoryId =
          typeof storyId === 'string' && storyId.trim().length > 4
            ? storyId.trim()
            : `st_${Date.now()}_${crypto.randomBytes(5).toString('hex')}`;

        const created = await createStatusStoryInDb({
          storyId: safeStoryId,
          authorPhone: author.phoneNormalized,
          authorName: author.fullName,
          authorAvatar: author.avatarUrl ?? null,
          storyType: type,
          textContent: type === 'text' ? String(textContent || '').trim() : null,
          mediaUrl: type !== 'text' ? String(mediaUrl || '').trim() : null,
          caption: type !== 'text' && caption ? String(caption).trim() : null,
          bgColor: type === 'text' ? String(bgColor || '#005c4b') : null,
        });

        // Broadcast to connected clients; each client filters to stories from contacts in their chats
        realtimeHub.broadcastAll({
          type: 'status:new',
          story: created,
        });

        res.status(201).json({ story: created });
      } catch (error) {
        console.error('Error in POST /api/statuses:', error);
        res.status(500).json({ code: 'STATUS_CREATE_FAILED', error: 'Failed to publish status.' });
      }
    }
  );

  // 19e. Mark Status Story Viewed
  app.post(
    '/api/statuses/:storyId/view',
    requireSessionAuth,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const viewerPhone = req.authUser!.phoneNormalized;
        const storyId = String(req.params.storyId || '').trim();
        if (!storyId) {
          res.status(400).json({ code: 'INVALID_STORY_ID', error: 'Story ID required.' });
          return;
        }

        const updated = await markStatusStoryViewedInDb(storyId, viewerPhone);
        if (updated && updated.authorPhone !== viewerPhone) {
          realtimeHub.sendToPhone(updated.authorPhone, {
            type: 'status:viewed',
            story: updated,
          });
        }

        res.json({ story: updated });
      } catch (error) {
        console.error('Error in POST /api/statuses/:storyId/view:', error);
        res.status(500).json({ code: 'STATUS_VIEW_FAILED', error: 'Failed to mark status viewed.' });
      }
    }
  );

  // 19f. Fetch User's Real Call Logs (Audio, Video & Missed Calls)
  app.get(
    '/api/calls/history',
    requireSessionAuth,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const myPhone = req.authUser!.phoneNormalized;
        const calls = await fetchUserCallHistory(myPhone);
        res.json({ calls });
      } catch (error) {
        console.error('Error in GET /api/calls/history:', error);
        res.status(500).json({ code: 'CALL_HISTORY_FAILED', error: 'Failed to load call logs.' });
      }
    }
  );

  // 19g. Mark Unseen Missed Calls as Seen When Opening Calls Tab
  app.post(
    '/api/calls/mark-missed-seen',
    requireSessionAuth,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const updatedCount = await markMissedCallsSeenInDb(req.authUser!.phoneNormalized);
        res.json({ updatedCount });
      } catch {
        res.status(500).json({ code: 'MARK_SEEN_FAILED', error: 'Failed to clear missed calls badge.' });
      }
    }
  );

  // 19h. Check if an active group call is in progress for a group
  app.get(
    '/api/calls/group-active/:groupId',
    requireSessionAuth,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const groupId = String(req.params.groupId || '').trim();
        // Check in-memory realtimeHub first for instantaneous state
        const liveCall = realtimeHub.getActiveGroupCallForGroup(groupId);
        if (liveCall && liveCall.status === 'active') {
          res.json({
            active: true,
            callId: liveCall.callId,
            callType: liveCall.callType,
            hostPhone: liveCall.hostPhone,
            hostName: liveCall.hostName,
            groupName: liveCall.groupName,
            participantCount: liveCall.participants.size,
          });
          return;
        }

        // Check persistent DB
        const dbCall = await getActiveGroupCallFromDb(groupId);
        res.json(dbCall || { active: false });
      } catch (err) {
        res.status(500).json({ code: 'GROUP_CALL_STATUS_FAILED', error: 'Failed to check active group call.' });
      }
    }
  );

  // 20. List Active Sessions
  app.get(
    '/api/account/sessions',
    requireSessionAuth,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const sessions = await listActiveSessionsForUser(
          req.authUser!.id,
          req.authSession!.sessionId
        );
        res.json({ sessions });
      } catch {
        res.status(500).json({
          code: 'SESSIONS_FETCH_FAILED',
          error: 'Failed to load active sessions.',
        });
      }
    }
  );

  // 21. Logout Current Device
  app.post(
    '/api/auth/logout',
    requireSessionAuth,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        await revokeSingleSession(req.authSession!.sessionId, req.authUser!.id);
        clearSessionCookie(req, res);
        res.json({ loggedOut: true });
      } catch {
        res.status(500).json({ code: 'LOGOUT_FAILED', error: 'Failed to sign out.' });
      }
    }
  );

  // 22. Logout All Devices
  app.post(
    '/api/auth/logout-all',
    requireSessionAuth,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const revokedCount = await revokeAllSessionsForUser(req.authUser!.id);
        clearSessionCookie(req, res);
        res.json({ loggedOut: true, revokedCount });
      } catch {
        res.status(500).json({
          code: 'LOGOUT_ALL_FAILED',
          error: 'Failed to sign out of all devices.',
        });
      }
    }
  );

  // 23. Delete Lifetime Account Permanently
  app.delete(
    '/api/account',
    requireSessionAuth,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { confirmPhrase } = req.body as { confirmPhrase?: string };
        if (confirmPhrase !== 'DELETE') {
          res.status(400).json({
            code: 'CONFIRMATION_REQUIRED',
            error: 'Type DELETE to confirm permanent account removal.',
          });
          return;
        }
        await permanentlyDeleteAccount(req.authUser!.id);
        clearSessionCookie(req, res);
        res.json({ deleted: true });
      } catch {
        res.status(500).json({
          code: 'DELETE_ACCOUNT_FAILED',
          error: 'Failed to delete account.',
        });
      }
    }
  );

  // --------------------------------------------------------------------------
  // 24. AI Messaging Endpoints (Gemini 3.8 Flash)
  // --------------------------------------------------------------------------
  app.post(
    '/api/ai/summarize',
    requireSessionAuth,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { messages = [], length = 'medium' } = req.body;
        const result = await summarizeConversation({ messages, length });
        res.json(result);
      } catch (err) {
        console.error('AI summarize error:', err);
        res.status(500).json({ code: 'AI_SUMMARIZE_FAILED', error: 'Failed to generate conversation summary.' });
      }
    }
  );

  app.post(
    '/api/ai/suggest',
    requireSessionAuth,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { text, contextMessages = [], action = 'suggest', style = 'friendly' } = req.body;
        const result = await suggestOrPolishReplies({ text, contextMessages, action, style });
        res.json(result);
      } catch (err) {
        console.error('AI suggest/polish error:', err);
        res.status(500).json({ code: 'AI_SUGGEST_FAILED', error: 'Suggestions generation failed.' });
      }
    }
  );

  app.post(
    '/api/ai/decisions',
    requireSessionAuth,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { messages = [] } = req.body;
        const result = await extractDecisionsAndTasks({ messages });
        res.json(result);
      } catch (err) {
        console.error('AI decisions error:', err);
        res.status(500).json({ code: 'AI_DECISIONS_FAILED', error: 'Failed to extract decisions and tasks.' });
      }
    }
  );

  // --------------------------------------------------------------------------
  // 25. Group Workspace (Tasks, Notes, Events)
  // --------------------------------------------------------------------------
  app.use(
    '/api/workspace/:conversationId',
    requireSessionAuth,
    async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        const groupId = String(req.params.conversationId || '');
        if (!(await isGroupMember(groupId, req.authUser!.phoneNormalized))) {
          res.status(404).json({ code: 'GROUP_NOT_FOUND', error: 'Group workspace not found.' });
          return;
        }
        next();
      } catch (error) {
        console.error('Group workspace access check failed:', error);
        res.status(500).json({ code: 'GROUP_ACCESS_CHECK_FAILED', error: 'Could not verify group access.' });
      }
    }
  );

  app.get(
    '/api/workspace/:conversationId/tasks',
    requireSessionAuth,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const convId = String(req.params.conversationId);
        const tasks = await fetchTasksForConversation(convId);
        res.json({ tasks });
      } catch (err) {
        res.status(500).json({ code: 'TASKS_FETCH_FAILED', error: 'Failed to load workspace tasks.' });
      }
    }
  );

  app.post(
    '/api/workspace/:conversationId/tasks',
    requireSessionAuth,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const convId = String(req.params.conversationId);
        const user = req.authUser!;
        const { title, assignedTo, dueDate, priority } = req.body;
        if (!title || !title.trim()) {
          res.status(400).json({ code: 'INVALID_TITLE', error: 'Task title is required.' });
          return;
        }
        const created = await createGroupTaskInDb({
          conversationId: convId,
          title: title.trim(),
          assignedTo,
          dueDate,
          priority,
          createdBy: user.phoneNormalized,
        });
        res.status(201).json({ task: created });
      } catch (err) {
        res.status(500).json({ code: 'TASK_CREATE_FAILED', error: 'Failed to create workspace task.' });
      }
    }
  );

  app.patch(
    '/api/workspace/:conversationId/tasks/:taskId',
    requireSessionAuth,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const taskId = String(req.params.taskId);
        const updated = await updateGroupTaskInDb(taskId, req.body);
        if (!updated) {
          res.status(404).json({ code: 'TASK_NOT_FOUND', error: 'Task not found.' });
          return;
        }
        res.json({ task: updated });
      } catch (err) {
        res.status(500).json({ code: 'TASK_UPDATE_FAILED', error: 'Failed to update task.' });
      }
    }
  );

  app.delete(
    '/api/workspace/:conversationId/tasks/:taskId',
    requireSessionAuth,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const taskId = String(req.params.taskId);
        const success = await deleteGroupTaskInDb(taskId);
        res.json({ success });
      } catch (err) {
        res.status(500).json({ code: 'TASK_DELETE_FAILED', error: 'Failed to delete task.' });
      }
    }
  );

  app.get(
    '/api/workspace/:conversationId/notes',
    requireSessionAuth,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const convId = String(req.params.conversationId);
        const notes = await fetchNotesForConversation(convId);
        res.json({ notes });
      } catch (err) {
        res.status(500).json({ code: 'NOTES_FETCH_FAILED', error: 'Failed to load workspace notes.' });
      }
    }
  );

  app.post(
    '/api/workspace/:conversationId/notes',
    requireSessionAuth,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const convId = String(req.params.conversationId);
        const user = req.authUser!;
        const { id, title, content } = req.body;
        if (!title || !title.trim()) {
          res.status(400).json({ code: 'INVALID_NOTE', error: 'Note title required.' });
          return;
        }
        const saved = await saveGroupNoteInDb({
          id,
          conversationId: convId,
          title: title.trim(),
          content: content || '',
          authorName: user.fullName,
          authorPhone: user.phoneNormalized,
        });
        res.json({ note: saved });
      } catch (err) {
        res.status(500).json({ code: 'NOTE_SAVE_FAILED', error: 'Failed to save note.' });
      }
    }
  );

  app.delete(
    '/api/workspace/:conversationId/notes/:noteId',
    requireSessionAuth,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const noteId = String(req.params.noteId);
        const success = await deleteGroupNoteInDb(noteId);
        res.json({ success });
      } catch (err) {
        res.status(500).json({ code: 'NOTE_DELETE_FAILED', error: 'Failed to delete note.' });
      }
    }
  );

  app.get(
    '/api/workspace/:conversationId/events',
    requireSessionAuth,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const convId = String(req.params.conversationId);
        const events = await fetchEventsForConversation(convId);
        res.json({ events });
      } catch (err) {
        res.status(500).json({ code: 'EVENTS_FETCH_FAILED', error: 'Failed to load workspace events.' });
      }
    }
  );

  app.post(
    '/api/workspace/:conversationId/events',
    requireSessionAuth,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const convId = String(req.params.conversationId);
        const user = req.authUser!;
        const { title, description, eventTime, location, attendees } = req.body;
        if (!title || !eventTime) {
          res.status(400).json({ code: 'INVALID_EVENT', error: 'Event title and time are required.' });
          return;
        }
        const created = await createGroupEventInDb({
          conversationId: convId,
          title: title.trim(),
          description,
          eventTime,
          location,
          creatorPhone: user.phoneNormalized,
          attendees,
        });
        res.status(201).json({ event: created });
      } catch (err) {
        res.status(500).json({ code: 'EVENT_CREATE_FAILED', error: 'Failed to create event.' });
      }
    }
  );

  app.delete(
    '/api/workspace/:conversationId/events/:eventId',
    requireSessionAuth,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const eventId = String(req.params.eventId);
        const success = await deleteGroupEventInDb(eventId);
        res.json({ success });
      } catch (err) {
        res.status(500).json({ code: 'EVENT_DELETE_FAILED', error: 'Failed to delete event.' });
      }
    }
  );

  // --------------------------------------------------------------------------
  // 26. Scheduled Messages
  // --------------------------------------------------------------------------
  app.get(
    '/api/scheduled-messages',
    requireSessionAuth,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const userPhone = req.authUser!.phoneNormalized;
        const list = await fetchScheduledMessagesForSender(userPhone);
        res.json({ scheduledMessages: list });
      } catch (err) {
        res.status(500).json({ code: 'SCHEDULED_FETCH_FAILED', error: 'Failed to load scheduled messages.' });
      }
    }
  );

  app.post(
    '/api/scheduled-messages',
    requireSessionAuth,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const senderPhone = req.authUser!.phoneNormalized;
        const { recipientPhone, conversationKey, text, mediaType = 'text', payload, scheduledFor } = req.body;

        if (!recipientPhone || !text || !scheduledFor) {
          res.status(400).json({
            code: 'INVALID_SCHEDULE_REQUEST',
            error: 'Recipient, text message, and scheduled date/time are required.',
          });
          return;
        }

        const scheduledDate = new Date(scheduledFor);
        if (Number.isNaN(scheduledDate.getTime()) || scheduledDate.getTime() <= Date.now()) {
          res.status(400).json({
            code: 'INVALID_SCHEDULE_TIME',
            error: 'Scheduled time must be a valid future date and time.',
          });
          return;
        }

        const key = conversationKey || [senderPhone, recipientPhone].sort().join('::');
        const created = await scheduleMessageInDb({
          senderPhone,
          recipientPhone,
          conversationKey: key,
          text,
          mediaType,
          payloadJson: payload ? JSON.stringify(payload) : undefined,
          scheduledFor: scheduledDate.toISOString(),
        });

        res.status(201).json({ scheduledMessage: created });
      } catch (err) {
        res.status(500).json({ code: 'SCHEDULE_FAILED', error: 'Failed to schedule message.' });
      }
    }
  );

  app.delete(
    '/api/scheduled-messages/:scheduleId',
    requireSessionAuth,
    async (req: AuthenticatedRequest, res: Response) => {
      try {
        const scheduleId = String(req.params.scheduleId);
        const senderPhone = req.authUser!.phoneNormalized;
        const success = await cancelScheduledMessageInDb(scheduleId, senderPhone);
        res.json({ success });
      } catch (err) {
        res.status(500).json({ code: 'SCHEDULE_CANCEL_FAILED', error: 'Failed to cancel scheduled message.' });
      }
    }
  );

  // ZOLO Ads: campaigns are private to their creator until an admin approves them.
  app.get('/api/ads/feed', requireSessionAuth, async (_req: AuthenticatedRequest, res: Response) => {
    try {
      const campaigns = await listAdCampaigns({ status: 'approved' });
      res.json({ campaigns });
    } catch (error) {
      console.error('Error in GET /api/ads/feed:', error);
      res.status(500).json({ code: 'AD_FEED_FAILED', error: 'Could not load sponsored content.' });
    }
  });

  app.get('/api/ads/campaigns', requireSessionAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const campaigns = await listAdCampaigns({ advertiserPhone: req.authUser!.phoneNormalized });
      res.json({ campaigns: await getAdAnalytics(campaigns) });
    } catch (error) {
      console.error('Error in GET /api/ads/campaigns:', error);
      res.status(500).json({ code: 'AD_CAMPAIGNS_FAILED', error: 'Could not load your advertisements.' });
    }
  });

  app.post('/api/ads/campaigns', requireSessionAuth, adWriteLimiter, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const creative = req.body as AdCreativeInput;
      if (!isTrustedAdImageUrl(creative?.imageUrl) ||
          (creative?.logoUrl && !isTrustedAdImageUrl(creative.logoUrl))) {
        res.status(400).json({ code: 'INVALID_AD_IMAGE', error: 'Upload advertisement images using the secure upload control.' });
        return;
      }
      await validatePublicWebUrl(creative.destinationUrl, true);
      const campaign = await createAdCampaign(req.authUser!.phoneNormalized, creative);
      res.status(201).json({ campaign });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not create advertisement.';
      res.status(400).json({ code: 'AD_CREATE_FAILED', error: message });
    }
  });

  app.patch('/api/ads/campaigns/:campaignId', requireSessionAuth, adWriteLimiter, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const creative = req.body as AdCreativeInput;
      if (!isTrustedAdImageUrl(creative?.imageUrl) ||
          (creative?.logoUrl && !isTrustedAdImageUrl(creative.logoUrl))) {
        res.status(400).json({ code: 'INVALID_AD_IMAGE', error: 'Upload advertisement images using the secure upload control.' });
        return;
      }
      await validatePublicWebUrl(creative.destinationUrl, true);
      const campaign = await updateAdCampaign({
        id: String(req.params.campaignId),
        advertiserPhone: req.authUser!.phoneNormalized,
        creative,
      });
      if (!campaign) {
        res.status(404).json({ code: 'AD_NOT_FOUND', error: 'Advertisement not found.' });
        return;
      }
      res.json({ campaign });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not update advertisement.';
      res.status(400).json({ code: 'AD_UPDATE_FAILED', error: message });
    }
  });

  app.patch('/api/ads/campaigns/:campaignId/status', requireSessionAuth, adWriteLimiter, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const campaign = await listAdCampaigns({ advertiserPhone: req.authUser!.phoneNormalized });
      const existing = campaign.find((item) => item.id === req.params.campaignId);
      const requestedStatus = req.body?.status;
      if (!existing) {
        res.status(404).json({ code: 'AD_NOT_FOUND', error: 'Advertisement not found.' });
        return;
      }
      if (requestedStatus === 'paused' && existing.status === 'approved') {
        const updated = await setAdCampaignStatus(existing.id, 'paused', null);
        res.json({ campaign: updated });
        return;
      }
      if (requestedStatus === 'approved' && existing.status === 'paused' && !existing.moderationNote) {
        const updated = await setAdCampaignStatus(existing.id, 'approved', null);
        res.json({ campaign: updated });
        return;
      }
      res.status(400).json({ code: 'INVALID_AD_STATUS', error: 'Only approved ads can be paused or resumed.' });
    } catch (error) {
      console.error('Error in PATCH /api/ads/campaigns/:campaignId/status:', error);
      res.status(500).json({ code: 'AD_STATUS_FAILED', error: 'Could not update advertisement status.' });
    }
  });

  app.delete('/api/ads/campaigns/:campaignId', requireSessionAuth, adWriteLimiter, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const success = await deleteAdCampaign(String(req.params.campaignId), req.authUser!.phoneNormalized);
      if (!success) {
        res.status(404).json({ code: 'AD_NOT_FOUND', error: 'Advertisement not found.' });
        return;
      }
      res.json({ success: true });
    } catch (error) {
      console.error('Error in DELETE /api/ads/campaigns/:campaignId:', error);
      res.status(500).json({ code: 'AD_DELETE_FAILED', error: 'Could not delete advertisement.' });
    }
  });

  app.post('/api/ads/events', requireSessionAuth, adEventLimiter, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { campaignId, eventType, eventKey } = req.body as {
        campaignId?: string;
        eventType?: string;
        eventKey?: string;
      };
      if (
        typeof campaignId !== 'string' ||
        !['impression', 'click', 'cta'].includes(eventType || '') ||
        typeof eventKey !== 'string' ||
        !/^[a-zA-Z0-9_-]{8,100}$/.test(eventKey)
      ) {
        res.status(400).json({ code: 'INVALID_AD_EVENT', error: 'Advertisement event is invalid.' });
        return;
      }
      await recordAdEvent({
        campaignId,
        eventType: eventType as 'impression' | 'click' | 'cta',
        viewerKey: hashAdIdentity(req.authUser!.phoneNormalized),
        eventKey,
      });
      res.status(202).json({ accepted: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not record advertisement event.';
      res.status(400).json({ code: 'AD_EVENT_FAILED', error: message });
    }
  });

  app.post('/api/ads/reports', requireSessionAuth, adWriteLimiter, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { campaignId, reason } = req.body as { campaignId?: string; reason?: string };
      if (typeof campaignId !== 'string' || (reason !== undefined && typeof reason !== 'string')) {
        res.status(400).json({ code: 'INVALID_AD_REPORT', error: 'Advertisement report is invalid.' });
        return;
      }
      await reportAd(campaignId, hashAdIdentity(req.authUser!.phoneNormalized), reason || 'Other');
      res.status(201).json({ accepted: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not report advertisement.';
      res.status(400).json({ code: 'AD_REPORT_FAILED', error: message });
    }
  });

  app.get('/api/ads/admin/campaigns', requireSessionAuth, async (req: AuthenticatedRequest, res: Response) => {
    if (!isConfiguredAdAdmin(req.authUser!.phoneNormalized)) {
      res.status(403).json({ code: 'AD_ADMIN_REQUIRED', error: 'Administrator access is required.' });
      return;
    }
    try {
      const campaigns = await listAdCampaigns({});
      const reports = await listAdReports();
      res.json({ campaigns: await getAdAnalytics(campaigns), reports, isAdmin: true });
    } catch (error) {
      console.error('Error in GET /api/ads/admin/campaigns:', error);
      res.status(500).json({ code: 'AD_ADMIN_FETCH_FAILED', error: 'Could not load the moderation queue.' });
    }
  });

  app.patch('/api/ads/admin/campaigns/:campaignId', requireSessionAuth, adWriteLimiter, async (req: AuthenticatedRequest, res: Response) => {
    if (!isConfiguredAdAdmin(req.authUser!.phoneNormalized)) {
      res.status(403).json({ code: 'AD_ADMIN_REQUIRED', error: 'Administrator access is required.' });
      return;
    }
    try {
      const status = req.body?.status;
      const note = typeof req.body?.note === 'string' ? req.body.note.trim().slice(0, 500) : '';
      if (!['approved', 'rejected', 'paused'].includes(status)) {
        res.status(400).json({ code: 'INVALID_MODERATION_STATUS', error: 'Choose approve, reject, or pause.' });
        return;
      }
      if (status === 'rejected' && note.length < 3) {
        res.status(400).json({ code: 'MODERATION_NOTE_REQUIRED', error: 'Add a moderation note when rejecting an ad.' });
        return;
      }
      const campaign = await setAdCampaignStatus(
        String(req.params.campaignId),
        status as AdStatus,
        note || (status === 'paused' ? 'Paused by administrator' : null)
      );
      if (!campaign) {
        res.status(404).json({ code: 'AD_NOT_FOUND', error: 'Advertisement not found.' });
        return;
      }
      res.json({ campaign });
    } catch (error) {
      console.error('Error in PATCH /api/ads/admin/campaigns/:campaignId:', error);
      res.status(500).json({ code: 'AD_MODERATION_FAILED', error: 'Could not moderate advertisement.' });
    }
  });

  app.delete('/api/ads/admin/campaigns/:campaignId', requireSessionAuth, adWriteLimiter, async (req: AuthenticatedRequest, res: Response) => {
    if (!isConfiguredAdAdmin(req.authUser!.phoneNormalized)) {
      res.status(403).json({ code: 'AD_ADMIN_REQUIRED', error: 'Administrator access is required.' });
      return;
    }
    try {
      const campaignId = String(req.params.campaignId);
      const campaign = await getAdCampaign(campaignId);
      if (!campaign) {
        res.status(404).json({ code: 'AD_NOT_FOUND', error: 'Advertisement not found.' });
        return;
      }
      await deleteAdCampaign(campaignId, campaign.advertiserPhone);
      res.json({ success: true });
    } catch (error) {
      console.error('Error in DELETE /api/ads/admin/campaigns/:campaignId:', error);
      res.status(500).json({ code: 'AD_ADMIN_DELETE_FAILED', error: 'Could not remove advertisement.' });
    }
  });

  // Start background message scheduler runner
  startSchedulerRunner();

  return app;
}
