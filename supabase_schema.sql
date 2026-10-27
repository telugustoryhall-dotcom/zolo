-- ============================================================================
-- ZOLO Chat - Supabase PostgreSQL Schema & Storage Setup
-- Project: https://pijsecoyaieqsurvxjtf.supabase.co
-- Run this script once in your Supabase Dashboard -> SQL Editor -> New Query
-- ============================================================================

-- 1. Lifetime Accounts Table (Mobile Number + Password Authentication)
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
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.users ADD COLUMN IF NOT EXISTS password_hash TEXT;

CREATE INDEX IF NOT EXISTS users_phone_normalized_idx ON public.users (phone_normalized);
CREATE INDEX IF NOT EXISTS users_username_idx ON public.users (username);

-- 2. Device Sessions Table (Expiration & Single/All-Device Revocation)
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

CREATE INDEX IF NOT EXISTS auth_sessions_user_id_idx ON public.auth_sessions (user_id);
CREATE INDEX IF NOT EXISTS auth_sessions_token_hash_idx ON public.auth_sessions (token_hash);

-- 3. Persistent Media Fallback Store
CREATE TABLE IF NOT EXISTS public.stored_media (
  id SERIAL PRIMARY KEY,
  object_key TEXT NOT NULL UNIQUE,
  mime_type TEXT NOT NULL,
  byte_size INTEGER NOT NULL,
  base64_data TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Real User-to-User Direct Messages Table
CREATE TABLE IF NOT EXISTS public.direct_messages (
  id SERIAL PRIMARY KEY,
  message_id TEXT NOT NULL UNIQUE,
  conversation_key TEXT NOT NULL,
  sender_phone TEXT NOT NULL,
  sender_name TEXT NOT NULL,
  sender_avatar TEXT,
  recipient_phone TEXT NOT NULL,
  text TEXT NOT NULL,
  media_type TEXT NOT NULL DEFAULT 'text',
  payload_json TEXT,
  status TEXT NOT NULL DEFAULT 'sent',
  deleted_for_everyone BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS direct_messages_conv_idx ON public.direct_messages (conversation_key);
CREATE INDEX IF NOT EXISTS direct_messages_sender_idx ON public.direct_messages (sender_phone);
CREATE INDEX IF NOT EXISTS direct_messages_recipient_idx ON public.direct_messages (recipient_phone);
CREATE INDEX IF NOT EXISTS direct_messages_created_idx ON public.direct_messages (created_at);

-- 5. Shared 24-Hour Status Stories Table
CREATE TABLE IF NOT EXISTS public.status_stories (
  id SERIAL PRIMARY KEY,
  story_id TEXT NOT NULL UNIQUE,
  author_phone TEXT NOT NULL,
  author_name TEXT NOT NULL,
  author_avatar TEXT,
  story_type TEXT NOT NULL DEFAULT 'text',
  text_content TEXT,
  media_url TEXT,
  caption TEXT,
  bg_color TEXT,
  viewer_phones_json TEXT NOT NULL DEFAULT '[]',
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS status_stories_author_idx ON public.status_stories (author_phone);
CREATE INDEX IF NOT EXISTS status_stories_expires_idx ON public.status_stories (expires_at);

-- 6. Real Internet Audio/Video Call Logs & Missed Calls Table
CREATE TABLE IF NOT EXISTS public.call_records (
  id SERIAL PRIMARY KEY,
  call_id TEXT NOT NULL UNIQUE,
  caller_phone TEXT NOT NULL,
  caller_name TEXT NOT NULL,
  caller_avatar TEXT,
  callee_phone TEXT NOT NULL,
  callee_name TEXT NOT NULL,
  callee_avatar TEXT,
  call_type TEXT NOT NULL DEFAULT 'audio',
  outcome TEXT NOT NULL DEFAULT 'ringing',
  duration_seconds INTEGER NOT NULL DEFAULT 0,
  missed_seen_by_callee BOOLEAN NOT NULL DEFAULT FALSE,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS call_records_caller_idx ON public.call_records (caller_phone);
CREATE INDEX IF NOT EXISTS call_records_callee_idx ON public.call_records (callee_phone);
CREATE INDEX IF NOT EXISTS call_records_started_idx ON public.call_records (started_at);

-- 7. Public Avatars Bucket in Supabase Storage
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  TRUE,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- 8. Row Level Security & Server Access Policies
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auth_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stored_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.direct_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.status_stories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.call_records ENABLE ROW LEVEL SECURITY;

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

DROP POLICY IF EXISTS "Backend status stories access" ON public.status_stories;
CREATE POLICY "Backend status stories access" ON public.status_stories
  FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Backend call records access" ON public.call_records;
CREATE POLICY "Backend call records access" ON public.call_records
  FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public avatar read" ON storage.objects;
CREATE POLICY "Public avatar read" ON storage.objects
  FOR SELECT USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "Backend avatar upload" ON storage.objects;
CREATE POLICY "Backend avatar upload" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'avatars');
