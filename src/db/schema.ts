import { relations } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

export const users = pgTable(
  'users',
  {
    id: serial('id').primaryKey(),
    uid: text('uid').notNull().unique(),
    firebaseUid: text('firebase_uid').unique(),
    email: text('email'),
    phoneNormalized: text('phone_normalized').notNull().unique(),
    countryCode: text('country_code').notNull().default('+91'),
    phoneVerified: boolean('phone_verified').notNull().default(true),
    phoneVerifiedAt: timestamp('phone_verified_at').notNull().defaultNow(),
    fullName: text('full_name').notNull(),
    username: text('username').unique(),
    about: text('about').notNull().default('Hey there! I am using ZOLO.'),
    avatarUrl: text('avatar_url'),
    passwordHash: text('password_hash'),
    recoveryKeyHash: text('recovery_key_hash'),
    chatStateJson: text('chat_state_json'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => [
    index('users_phone_normalized_idx').on(table.phoneNormalized),
    index('users_username_idx').on(table.username),
  ]
);

export const otpChallenges = pgTable(
  'otp_challenges',
  {
    id: serial('id').primaryKey(),
    challengeId: text('challenge_id').notNull().unique(),
    phoneNormalized: text('phone_normalized').notNull(),
    purpose: text('purpose').notNull(),
    otpHash: text('otp_hash').notNull(),
    otpSalt: text('otp_salt').notNull(),
    attempts: integer('attempts').notNull().default(0),
    maxAttempts: integer('max_attempts').notNull().default(5),
    resendCount: integer('resend_count').notNull().default(0),
    verificationTokenHash: text('verification_token_hash'),
    verifiedAt: timestamp('verified_at'),
    consumed: boolean('consumed').notNull().default(false),
    requesterIp: text('requester_ip'),
    lastSentAt: timestamp('last_sent_at').notNull().defaultNow(),
    expiresAt: timestamp('expires_at').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [
    index('otp_challenges_phone_idx').on(table.phoneNormalized),
    index('otp_challenges_expires_idx').on(table.expiresAt),
  ]
);

export const authSessions = pgTable(
  'auth_sessions',
  {
    id: serial('id').primaryKey(),
    sessionId: text('session_id').notNull().unique(),
    userId: integer('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    tokenHash: text('token_hash').notNull().unique(),
    userAgent: text('user_agent'),
    ipAddress: text('ip_address'),
    expiresAt: timestamp('expires_at').notNull(),
    revokedAt: timestamp('revoked_at'),
    lastActiveAt: timestamp('last_active_at').notNull().defaultNow(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [
    index('auth_sessions_user_id_idx').on(table.userId),
    index('auth_sessions_token_hash_idx').on(table.tokenHash),
  ]
);

export const storedMedia = pgTable('stored_media', {
  id: serial('id').primaryKey(),
  objectKey: text('object_key').notNull().unique(),
  mimeType: text('mime_type').notNull(),
  byteSize: integer('byte_size').notNull(),
  base64Data: text('base64_data').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const directMessages = pgTable(
  'direct_messages',
  {
    id: serial('id').primaryKey(),
    messageId: text('message_id').notNull().unique(),
    conversationKey: text('conversation_key').notNull(),
    senderPhone: text('sender_phone').notNull(),
    senderName: text('sender_name').notNull(),
    senderAvatar: text('sender_avatar'),
    recipientPhone: text('recipient_phone').notNull(),
    text: text('text').notNull(),
    mediaType: text('media_type').notNull().default('text'),
    payloadJson: text('payload_json'),
    status: text('status').notNull().default('sent'), // 'sent' | 'delivered' | 'read'
    deletedForEveryone: boolean('deleted_for_everyone').notNull().default(false),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (table) => [
    index('direct_messages_conv_idx').on(table.conversationKey),
    index('direct_messages_sender_idx').on(table.senderPhone),
    index('direct_messages_recipient_idx').on(table.recipientPhone),
    index('direct_messages_created_idx').on(table.createdAt),
  ]
);

export const statusStories = pgTable(
  'status_stories',
  {
    id: serial('id').primaryKey(),
    storyId: text('story_id').notNull().unique(),
    authorPhone: text('author_phone').notNull(),
    authorName: text('author_name').notNull(),
    authorAvatar: text('author_avatar'),
    storyType: text('story_type').notNull().default('text'), // 'text' | 'image'
    textContent: text('text_content'),
    mediaUrl: text('media_url'),
    caption: text('caption'),
    bgColor: text('bg_color'),
    viewerPhonesJson: text('viewer_phones_json').notNull().default('[]'),
    expiresAt: timestamp('expires_at').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (table) => [
    index('status_stories_author_idx').on(table.authorPhone),
    index('status_stories_expires_idx').on(table.expiresAt),
  ]
);

export const callRecords = pgTable(
  'call_records',
  {
    id: serial('id').primaryKey(),
    callId: text('call_id').notNull().unique(),
    callerPhone: text('caller_phone').notNull(),
    callerName: text('caller_name').notNull(),
    callerAvatar: text('caller_avatar'),
    calleePhone: text('callee_phone').notNull(),
    calleeName: text('callee_name').notNull(),
    calleeAvatar: text('callee_avatar'),
    callType: text('call_type').notNull().default('audio'), // 'audio' | 'video'
    outcome: text('outcome').notNull().default('ringing'), // 'ringing' | 'answered' | 'missed' | 'rejected' | 'busy'
    durationSeconds: integer('duration_seconds').notNull().default(0),
    missedSeenByCallee: boolean('missed_seen_by_callee').notNull().default(false),
    startedAt: timestamp('started_at').notNull().defaultNow(),
    endedAt: timestamp('ended_at'),
  },
  (table) => [
    index('call_records_caller_idx').on(table.callerPhone),
    index('call_records_callee_idx').on(table.calleePhone),
    index('call_records_started_idx').on(table.startedAt),
  ]
);

export const usersRelations = relations(users, ({ many }) => ({
  sessions: many(authSessions),
}));

export const authSessionsRelations = relations(authSessions, ({ one }) => ({
  user: one(users, {
    fields: [authSessions.userId],
    references: [users.id],
  }),
}));

export type DbUser = typeof users.$inferSelect;
export type NewDbUser = typeof users.$inferInsert;
export type DbSession = typeof authSessions.$inferSelect;
export type DbOtpChallenge = typeof otpChallenges.$inferSelect;
export type DbDirectMessage = typeof directMessages.$inferSelect;
export type DbStatusStory = typeof statusStories.$inferSelect;
export type DbCallRecord = typeof callRecords.$inferSelect;
