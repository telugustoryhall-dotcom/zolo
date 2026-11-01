-- ============================================================================
-- ZOLO CHAT — COMPLETE SUPABASE POSTGRESQL SCHEMA & REALTIME CONFIGURATION
-- Project: https://beqkcbugflzopzvzhkua.supabase.co
--
-- Instructions:
-- 1. Open your Supabase Project Dashboard
-- 2. Navigate to "SQL Editor" -> "New Query"
-- 3. Paste and run this entire script
-- 4. All tables, constraints, indexes, RLS policies, storage buckets,
--    and Supabase Realtime CDC publications will be created/updated safely!
-- ============================================================================

-- Enable required cryptographic and utility extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- 1. USERS & PROFILES TABLE
-- Supports mobile number authentication, avatars, about, password hashing,
-- recovery credentials, and persistent client preferences.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.users (
  id SERIAL PRIMARY KEY,
  uid TEXT NOT NULL UNIQUE,
  firebase_uid TEXT UNIQUE,
  email TEXT,
  phone_normalized TEXT NOT NULL UNIQUE,
  country_code TEXT NOT NULL DEFAULT '+91',
  phone_verified BOOLEAN NOT NULL DEFAULT TRUE,
  phone_verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  full_name TEXT NOT NULL,
  username TEXT UNIQUE,
  about TEXT NOT NULL DEFAULT 'Hey there! I am using ZOLO.',
  avatar_url TEXT,
  password_hash TEXT,
  recovery_key_hash TEXT,
  chat_state_json TEXT,
  theme TEXT NOT NULL DEFAULT 'dark',
  last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  online BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Ensure newer columns exist on pre-existing tables without data loss
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS password_hash TEXT;
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS theme TEXT NOT NULL DEFAULT 'dark';
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS online BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_users_phone_normalized ON public.users (phone_normalized);
CREATE INDEX IF NOT EXISTS idx_users_username ON public.users (username);
CREATE INDEX IF NOT EXISTS idx_users_uid ON public.users (uid);

-- ============================================================================
-- 2. AUTH SESSIONS TABLE
-- Supports multi-device sessions, single-device sign-out, and global logout.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.auth_sessions (
  id SERIAL PRIMARY KEY,
  session_id TEXT NOT NULL UNIQUE,
  user_id INTEGER NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  user_agent TEXT,
  ip_address TEXT,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  last_active_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_auth_sessions_user_id ON public.auth_sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_token_hash ON public.auth_sessions (token_hash);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_expires_at ON public.auth_sessions (expires_at);

-- ============================================================================
-- 3. PERSISTENT MEDIA OBJECTS TABLE
-- Stores profile pictures, voice notes, photos, videos, and shared documents.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.stored_media (
  id SERIAL PRIMARY KEY,
  object_key TEXT NOT NULL UNIQUE,
  mime_type TEXT NOT NULL,
  byte_size INTEGER NOT NULL,
  base64_data TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stored_media_key ON public.stored_media (object_key);

-- ============================================================================
-- 4. REAL DIRECT MESSAGES TABLE (1-on-1 Messaging)
-- Supports real-time text, voice notes, photos, videos, documents,
-- Google Maps locations, polls, replies, reactions, and read receipts.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.direct_messages (
  id SERIAL PRIMARY KEY,
  message_id TEXT NOT NULL UNIQUE,
  conversation_key TEXT NOT NULL,
  sender_phone TEXT NOT NULL,
  sender_name TEXT NOT NULL,
  sender_avatar TEXT,
  recipient_phone TEXT NOT NULL,
  text TEXT NOT NULL,
  media_type TEXT NOT NULL DEFAULT 'text', -- 'text' | 'image' | 'video' | 'audio' | 'document' | 'location' | 'poll'
  payload_json TEXT,                       -- JSON with mediaUrl, fileName, fileSize, waveform, location, poll, replyTo, reactions
  status TEXT NOT NULL DEFAULT 'sent',     -- 'pending' | 'sending' | 'sent' | 'delivered' | 'read' | 'failed'
  deleted_for_everyone BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dm_conv_key ON public.direct_messages (conversation_key);
CREATE INDEX IF NOT EXISTS idx_dm_sender ON public.direct_messages (sender_phone);
CREATE INDEX IF NOT EXISTS idx_dm_recipient ON public.direct_messages (recipient_phone);
CREATE INDEX IF NOT EXISTS idx_dm_created_at ON public.direct_messages (created_at);
CREATE INDEX IF NOT EXISTS idx_dm_status ON public.direct_messages (status);

-- ============================================================================
-- 5. RELATIONAL CONVERSATIONS & GROUP MEMBERSHIP TABLES
-- True multi-user group chat architecture:
-- User A creates group -> User B, C, D see the exact same shared group in their inbox!
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.conversations (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL DEFAULT 'direct', -- 'direct' | 'group'
  name TEXT,
  description TEXT,
  avatar_url TEXT,
  created_by TEXT,                     -- phone number or uid of creator
  metadata_json TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE public.conversations ADD COLUMN IF NOT EXISTS created_by TEXT;

CREATE INDEX IF NOT EXISTS idx_conversations_type ON public.conversations (type);

CREATE TABLE IF NOT EXISTS public.conversation_members (
  id SERIAL PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_phone TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member', -- 'owner' | 'admin' | 'member'
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_read_at TIMESTAMPTZ,
  UNIQUE(conversation_id, user_phone)
);

CREATE INDEX IF NOT EXISTS idx_conv_members_user ON public.conversation_members (user_phone);
CREATE INDEX IF NOT EXISTS idx_conv_members_conv ON public.conversation_members (conversation_id);

CREATE TABLE IF NOT EXISTS public.messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_phone TEXT NOT NULL,
  sender_name TEXT NOT NULL,
  sender_avatar TEXT,
  text TEXT NOT NULL,
  media_type TEXT NOT NULL DEFAULT 'text',
  payload_json TEXT,
  status TEXT NOT NULL DEFAULT 'sent',
  deleted_for_everyone BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS sender_avatar TEXT;

CREATE INDEX IF NOT EXISTS idx_messages_conv_id ON public.messages (conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_created ON public.messages (created_at);

CREATE TABLE IF NOT EXISTS public.message_receipts (
  id SERIAL PRIMARY KEY,
  message_id TEXT NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  recipient_phone TEXT NOT NULL,
  delivered_at TIMESTAMPTZ,
  read_at TIMESTAMPTZ,
  UNIQUE(message_id, recipient_phone)
);

CREATE INDEX IF NOT EXISTS idx_receipts_recipient ON public.message_receipts (recipient_phone);
CREATE INDEX IF NOT EXISTS idx_receipts_message ON public.message_receipts (message_id);

-- ============================================================================
-- 6. SHARED 24-HOUR STATUS STORIES TABLE
-- Automatically expires exactly 24 hours after creation.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.status_stories (
  id SERIAL PRIMARY KEY,
  story_id TEXT NOT NULL UNIQUE,
  author_phone TEXT NOT NULL,
  author_name TEXT NOT NULL,
  author_avatar TEXT,
  story_type TEXT NOT NULL DEFAULT 'text', -- 'text' | 'image' | 'video'
  text_content TEXT,
  media_url TEXT,
  caption TEXT,
  bg_color TEXT,
  viewer_phones_json TEXT NOT NULL DEFAULT '[]',
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_status_author ON public.status_stories (author_phone);
CREATE INDEX IF NOT EXISTS idx_status_expires ON public.status_stories (expires_at);

-- Automatic 24-hour expiration trigger function
CREATE OR REPLACE FUNCTION public.enforce_status_24h_expiration()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.expires_at IS NULL OR NEW.expires_at <= NEW.created_at THEN
    NEW.expires_at := NEW.created_at + INTERVAL '24 hours';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_status_24h_expiration ON public.status_stories;
CREATE TRIGGER trg_status_24h_expiration
  BEFORE INSERT ON public.status_stories
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_status_24h_expiration();

-- ============================================================================
-- 7. AUDIO/VIDEO CALL LOGS & WEBRTC CALL SESSIONS
-- Tracks live calls, connection states, call duration, and missed call badges.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.call_records (
  id SERIAL PRIMARY KEY,
  call_id TEXT NOT NULL UNIQUE,
  caller_phone TEXT NOT NULL,
  caller_name TEXT NOT NULL,
  caller_avatar TEXT,
  callee_phone TEXT NOT NULL,
  callee_name TEXT NOT NULL,
  callee_avatar TEXT,
  call_type TEXT NOT NULL DEFAULT 'audio', -- 'audio' | 'video'
  outcome TEXT NOT NULL DEFAULT 'ringing', -- 'ringing' | 'answered' | 'missed' | 'rejected' | 'busy'
  duration_seconds INTEGER NOT NULL DEFAULT 0,
  missed_seen_by_callee BOOLEAN NOT NULL DEFAULT FALSE,
  group_id TEXT,
  is_group BOOLEAN NOT NULL DEFAULT FALSE,
  group_name TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ
);

ALTER TABLE public.call_records ADD COLUMN IF NOT EXISTS group_id TEXT;
ALTER TABLE public.call_records ADD COLUMN IF NOT EXISTS is_group BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.call_records ADD COLUMN IF NOT EXISTS group_name TEXT;

CREATE INDEX IF NOT EXISTS idx_calls_caller ON public.call_records (caller_phone);
CREATE INDEX IF NOT EXISTS idx_calls_callee ON public.call_records (callee_phone);
CREATE INDEX IF NOT EXISTS idx_calls_group_id ON public.call_records (group_id);
CREATE INDEX IF NOT EXISTS idx_calls_started_at ON public.call_records (started_at);

-- ============================================================================
-- 7b. GROUP CALL PARTICIPANTS TABLE
-- Tracks live participants, roles, joined/left timestamps, and media states.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.call_participants (
  id SERIAL PRIMARY KEY,
  call_id TEXT NOT NULL,
  conversation_id TEXT,
  user_phone TEXT NOT NULL,
  user_name TEXT NOT NULL,
  user_avatar TEXT,
  role TEXT NOT NULL DEFAULT 'member', -- 'host' | 'member'
  status TEXT NOT NULL DEFAULT 'invited', -- 'invited' | 'joined' | 'left' | 'declined' | 'missed'
  is_muted BOOLEAN NOT NULL DEFAULT FALSE,
  is_video_off BOOLEAN NOT NULL DEFAULT FALSE,
  joined_at TIMESTAMPTZ,
  left_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(call_id, user_phone)
);

CREATE INDEX IF NOT EXISTS idx_call_part_call_id ON public.call_participants (call_id);
CREATE INDEX IF NOT EXISTS idx_call_part_user_phone ON public.call_participants (user_phone);
CREATE INDEX IF NOT EXISTS idx_call_part_status ON public.call_participants (status);

-- ============================================================================
-- 8. GROUP WORKSPACE TABLES (Tasks, Notes, Events)
-- Powers group project planning, assignment, and calendar coordination.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.group_tasks (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  title TEXT NOT NULL,
  assigned_to TEXT,
  due_date TEXT,
  priority TEXT NOT NULL DEFAULT 'medium', -- 'low' | 'medium' | 'high'
  status TEXT NOT NULL DEFAULT 'pending',   -- 'pending' | 'in_progress' | 'completed'
  created_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tasks_conversation ON public.group_tasks (conversation_id);

CREATE TABLE IF NOT EXISTS public.group_notes (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  author_name TEXT NOT NULL,
  author_phone TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notes_conversation ON public.group_notes (conversation_id);

CREATE TABLE IF NOT EXISTS public.group_events (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  event_time TIMESTAMPTZ NOT NULL,
  location TEXT,
  creator_phone TEXT NOT NULL,
  attendees_json TEXT NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_events_conversation ON public.group_events (conversation_id);

-- ============================================================================
-- 9. SCHEDULED MESSAGES TABLE
-- Powers automated scheduled message dispatching with background runner.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.scheduled_messages (
  id TEXT PRIMARY KEY,
  schedule_id TEXT NOT NULL UNIQUE,
  sender_phone TEXT NOT NULL,
  recipient_phone TEXT NOT NULL,
  conversation_key TEXT NOT NULL,
  text TEXT NOT NULL,
  media_type TEXT NOT NULL DEFAULT 'text',
  payload_json TEXT,
  scheduled_for TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'sent' | 'cancelled'
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sched_sender ON public.scheduled_messages (sender_phone);
CREATE INDEX IF NOT EXISTS idx_sched_status ON public.scheduled_messages (status);
CREATE INDEX IF NOT EXISTS idx_sched_time ON public.scheduled_messages (scheduled_for);

-- ============================================================================
-- 10. SUPABASE STORAGE BUCKETS
-- Public buckets for fast CDN asset retrieval: 'avatars' and 'attachments'.
-- ============================================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  TRUE,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'attachments',
  'attachments',
  TRUE,
  26214400, -- 25 MB
  NULL
)
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- 11. SUPABASE REALTIME CHANGE DATA CAPTURE (CDC) SETUP
-- Enables live updates for messages, groups, statuses, and call signaling!
-- ============================================================================
ALTER TABLE public.users REPLICA IDENTITY FULL;
ALTER TABLE public.direct_messages REPLICA IDENTITY FULL;
ALTER TABLE public.conversations REPLICA IDENTITY FULL;
ALTER TABLE public.conversation_members REPLICA IDENTITY FULL;
ALTER TABLE public.messages REPLICA IDENTITY FULL;
ALTER TABLE public.status_stories REPLICA IDENTITY FULL;
ALTER TABLE public.call_records REPLICA IDENTITY FULL;
ALTER TABLE public.call_participants REPLICA IDENTITY FULL;
ALTER TABLE public.group_tasks REPLICA IDENTITY FULL;
ALTER TABLE public.group_notes REPLICA IDENTITY FULL;
ALTER TABLE public.group_events REPLICA IDENTITY FULL;
ALTER TABLE public.scheduled_messages REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
END $$;

ALTER PUBLICATION supabase_realtime ADD TABLE public.users;
ALTER PUBLICATION supabase_realtime ADD TABLE public.direct_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
ALTER PUBLICATION supabase_realtime ADD TABLE public.conversation_members;
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.status_stories;
ALTER PUBLICATION supabase_realtime ADD TABLE public.call_records;
ALTER PUBLICATION supabase_realtime ADD TABLE public.call_participants;
ALTER PUBLICATION supabase_realtime ADD TABLE public.group_tasks;
ALTER PUBLICATION supabase_realtime ADD TABLE public.group_notes;
ALTER PUBLICATION supabase_realtime ADD TABLE public.group_events;
ALTER PUBLICATION supabase_realtime ADD TABLE public.scheduled_messages;

-- ============================================================================
-- 12. ROW LEVEL SECURITY (RLS) POLICIES
-- Protects users, conversations, messages, media, and status updates.
-- ============================================================================
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auth_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stored_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.direct_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.status_stories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.call_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.call_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scheduled_messages ENABLE ROW LEVEL SECURITY;

-- Backend Service & Authenticated Client Policies
DROP POLICY IF EXISTS "Backend call participants access" ON public.call_participants;
CREATE POLICY "Backend call participants access" ON public.call_participants
  FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Backend users access" ON public.users;
CREATE POLICY "Backend users access" ON public.users
  FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Backend sessions access" ON public.auth_sessions;
CREATE POLICY "Backend sessions access" ON public.auth_sessions
  FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Backend media access" ON public.stored_media;
CREATE POLICY "Backend media access" ON public.stored_media
  FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Backend direct messages access" ON public.direct_messages;
CREATE POLICY "Backend direct messages access" ON public.direct_messages
  FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Backend conversations access" ON public.conversations;
CREATE POLICY "Backend conversations access" ON public.conversations
  FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Backend members access" ON public.conversation_members;
CREATE POLICY "Backend members access" ON public.conversation_members
  FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Backend messages access" ON public.messages;
CREATE POLICY "Backend messages access" ON public.messages
  FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Backend receipts access" ON public.message_receipts;
CREATE POLICY "Backend receipts access" ON public.message_receipts
  FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Backend status stories access" ON public.status_stories;
CREATE POLICY "Backend status stories access" ON public.status_stories
  FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Backend call records access" ON public.call_records;
CREATE POLICY "Backend call records access" ON public.call_records
  FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Backend group tasks access" ON public.group_tasks;
CREATE POLICY "Backend group tasks access" ON public.group_tasks
  FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Backend group notes access" ON public.group_notes;
CREATE POLICY "Backend group notes access" ON public.group_notes
  FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Backend group events access" ON public.group_events;
CREATE POLICY "Backend group events access" ON public.group_events
  FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Backend scheduled messages access" ON public.scheduled_messages;
CREATE POLICY "Backend scheduled messages access" ON public.scheduled_messages
  FOR ALL USING (true) WITH CHECK (true);

-- Storage bucket access policies
DROP POLICY IF EXISTS "Public avatar read" ON storage.objects;
CREATE POLICY "Public avatar read" ON storage.objects
  FOR SELECT USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "Backend avatar upload" ON storage.objects;
CREATE POLICY "Backend avatar upload" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'avatars');

DROP POLICY IF EXISTS "Public attachment read" ON storage.objects;
CREATE POLICY "Public attachment read" ON storage.objects
  FOR SELECT USING (bucket_id = 'attachments');

DROP POLICY IF EXISTS "Backend attachment upload" ON storage.objects;
CREATE POLICY "Backend attachment upload" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'attachments');

-- ============================================================================
-- 13. AUTOMATED 24-HOUR STATUS CLEANUP FUNCTION
-- Periodically prunes expired status stories from previous days.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.cleanup_expired_statuses()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM public.status_stories
  WHERE expires_at < NOW();
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 14. CHAT CATEGORIES & ORGANIZATION (User-Specific)
-- Allows users to organize conversations into Personal, Work, Study, Family,
-- Friends, Important, or custom categories privately.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.chat_categories (
  id TEXT PRIMARY KEY,
  user_phone TEXT NOT NULL,
  name TEXT NOT NULL,
  color TEXT NOT NULL DEFAULT '#00a884',
  icon TEXT,
  order_idx INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_phone, name)
);

CREATE INDEX IF NOT EXISTS idx_chat_categories_user ON public.chat_categories (user_phone);

CREATE TABLE IF NOT EXISTS public.user_chat_categories (
  id SERIAL PRIMARY KEY,
  user_phone TEXT NOT NULL,
  conversation_id TEXT NOT NULL,
  category_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_phone, conversation_id, category_id)
);

CREATE INDEX IF NOT EXISTS idx_user_chat_cat_user ON public.user_chat_categories (user_phone);
CREATE INDEX IF NOT EXISTS idx_user_chat_cat_conv ON public.user_chat_categories (conversation_id);
CREATE INDEX IF NOT EXISTS idx_user_chat_cat_cat ON public.user_chat_categories (category_id);

-- ============================================================================
-- 15. INDIVIDUAL CHAT THEMES & WALLPAPERS (User-Specific)
-- Allows per-conversation themes, bubble colors, wallpapers, and contrast.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.user_chat_themes (
  id SERIAL PRIMARY KEY,
  user_phone TEXT NOT NULL,
  conversation_id TEXT NOT NULL,
  theme_config_json TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_phone, conversation_id)
);

CREATE INDEX IF NOT EXISTS idx_user_chat_themes_lookup ON public.user_chat_themes (user_phone, conversation_id);

-- ============================================================================
-- 16. USER RINGTONE SETTINGS & CUSTOM AUDIO STORAGE (User-Specific)
-- Supports incoming voice, video, and group call ringtone preferences.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.user_ringtone_settings (
  id SERIAL PRIMARY KEY,
  user_phone TEXT NOT NULL UNIQUE,
  voice_ringtone_id TEXT NOT NULL DEFAULT 'zolo-pulse',
  video_ringtone_id TEXT NOT NULL DEFAULT 'classic-bell',
  group_ringtone_id TEXT NOT NULL DEFAULT 'neon-cyber',
  volume NUMERIC NOT NULL DEFAULT 0.85,
  vibration_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  custom_ringtones_json TEXT NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_ringtone_phone ON public.user_ringtone_settings (user_phone);

-- RLS Policies for Categories, Themes, and Ringtones
ALTER TABLE public.chat_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_chat_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_chat_themes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_ringtone_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Backend chat categories access" ON public.chat_categories;
CREATE POLICY "Backend chat categories access" ON public.chat_categories
  FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Backend user chat categories access" ON public.user_chat_categories;
CREATE POLICY "Backend user chat categories access" ON public.user_chat_categories
  FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Backend user chat themes access" ON public.user_chat_themes;
CREATE POLICY "Backend user chat themes access" ON public.user_chat_themes
  FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Backend user ringtones access" ON public.user_ringtone_settings;
CREATE POLICY "Backend user ringtones access" ON public.user_ringtone_settings
  FOR ALL USING (true) WITH CHECK (true);

