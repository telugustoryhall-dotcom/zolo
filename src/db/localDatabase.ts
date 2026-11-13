import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, '../../data');

let localDbInstance: DatabaseSync | null = null;

export function getLocalDb(): DatabaseSync {
  if (!localDbInstance) {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const dbPath = path.join(DATA_DIR, 'zolo_local.db');
    const db = new DatabaseSync(dbPath);

    // Enable WAL mode for high concurrency
    db.exec('PRAGMA journal_mode = WAL;');
    db.exec('PRAGMA synchronous = NORMAL;');

    // 1. Users table
    db.exec(`
      CREATE TABLE IF NOT EXISTS local_users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        uid TEXT NOT NULL UNIQUE,
        firebase_uid TEXT UNIQUE,
        email TEXT,
        phone_normalized TEXT NOT NULL UNIQUE,
        country_code TEXT NOT NULL DEFAULT '+91',
        phone_verified INTEGER NOT NULL DEFAULT 1,
        phone_verified_at TEXT NOT NULL,
        full_name TEXT NOT NULL,
        username TEXT UNIQUE,
        about TEXT NOT NULL DEFAULT 'Hey there! I am using ZOLO.',
        avatar_url TEXT,
        password_hash TEXT,
        recovery_key_hash TEXT,
        chat_state_json TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_local_users_phone ON local_users(phone_normalized);
      CREATE INDEX IF NOT EXISTS idx_local_users_username ON local_users(username);
    `);

    // 2. Auth Sessions table
    db.exec(`
      CREATE TABLE IF NOT EXISTS local_auth_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL UNIQUE,
        user_id INTEGER NOT NULL,
        token_hash TEXT NOT NULL UNIQUE,
        user_agent TEXT,
        ip_address TEXT,
        expires_at TEXT NOT NULL,
        revoked_at TEXT,
        last_active_at TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_local_sessions_user ON local_auth_sessions(user_id);
      CREATE INDEX IF NOT EXISTS idx_local_sessions_token ON local_auth_sessions(token_hash);
    `);

    db.exec(`
      CREATE TABLE IF NOT EXISTS local_fcm_devices (
        token TEXT PRIMARY KEY,
        phone_normalized TEXT NOT NULL,
        session_id TEXT NOT NULL REFERENCES local_auth_sessions(session_id) ON DELETE CASCADE,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_local_fcm_devices_phone ON local_fcm_devices(phone_normalized);
      CREATE INDEX IF NOT EXISTS idx_local_fcm_devices_session ON local_fcm_devices(session_id);

      CREATE TABLE IF NOT EXISTS local_notification_preferences (
        phone_normalized TEXT PRIMARY KEY,
        private_messages INTEGER NOT NULL DEFAULT 1,
        group_messages INTEGER NOT NULL DEFAULT 1,
        calls INTEGER NOT NULL DEFAULT 1,
        group_calls INTEGER NOT NULL DEFAULT 1,
        other_activity INTEGER NOT NULL DEFAULT 1,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS local_notification_events (
        phone_normalized TEXT NOT NULL,
        event_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY(phone_normalized, event_id)
      );
      CREATE INDEX IF NOT EXISTS idx_local_notification_events_created ON local_notification_events(created_at);
    `);

    // 3. Direct Messages table
    db.exec(`
      CREATE TABLE IF NOT EXISTS local_direct_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
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
        deleted_for_everyone INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_local_dm_conv ON local_direct_messages(conversation_key);
      CREATE INDEX IF NOT EXISTS idx_local_dm_sender ON local_direct_messages(sender_phone);
      CREATE INDEX IF NOT EXISTS idx_local_dm_recipient ON local_direct_messages(recipient_phone);
      CREATE INDEX IF NOT EXISTS idx_local_dm_created ON local_direct_messages(created_at);
    `);

    db.exec(`
      CREATE TABLE IF NOT EXISTS local_conversations (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL DEFAULT 'group',
        name TEXT NOT NULL,
        description TEXT,
        avatar_url TEXT,
        created_by TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS local_conversation_members (
        conversation_id TEXT NOT NULL REFERENCES local_conversations(id) ON DELETE CASCADE,
        user_phone TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'member',
        joined_at TEXT NOT NULL,
        PRIMARY KEY(conversation_id, user_phone)
      );
      CREATE INDEX IF NOT EXISTS idx_local_conv_members_user ON local_conversation_members(user_phone);
      CREATE TABLE IF NOT EXISTS local_group_messages (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL REFERENCES local_conversations(id) ON DELETE CASCADE,
        sender_phone TEXT NOT NULL,
        sender_name TEXT NOT NULL,
        sender_avatar TEXT,
        text TEXT NOT NULL,
        media_type TEXT NOT NULL DEFAULT 'text',
        payload_json TEXT,
        status TEXT NOT NULL DEFAULT 'sent',
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_local_group_messages_conversation ON local_group_messages(conversation_id, created_at);
    `);

    // 4. Status Stories table
    db.exec(`
      CREATE TABLE IF NOT EXISTS local_status_stories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
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
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_local_status_author ON local_status_stories(author_phone);
      CREATE INDEX IF NOT EXISTS idx_local_status_expires ON local_status_stories(expires_at);
    `);

    // 5. Call Records table
    db.exec(`
      CREATE TABLE IF NOT EXISTS local_call_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
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
        missed_seen_by_callee INTEGER NOT NULL DEFAULT 0,
        group_id TEXT,
        is_group INTEGER NOT NULL DEFAULT 0,
        group_name TEXT,
        started_at TEXT NOT NULL,
        ended_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_local_calls_caller ON local_call_records(caller_phone);
      CREATE INDEX IF NOT EXISTS idx_local_calls_callee ON local_call_records(callee_phone);
      CREATE INDEX IF NOT EXISTS idx_local_calls_started ON local_call_records(started_at);

      -- Group Call Participants table
      CREATE TABLE IF NOT EXISTS local_call_participants (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        call_id TEXT NOT NULL,
        conversation_id TEXT,
        user_phone TEXT NOT NULL,
        user_name TEXT NOT NULL,
        user_avatar TEXT,
        role TEXT NOT NULL DEFAULT 'member',
        status TEXT NOT NULL DEFAULT 'invited',
        is_muted INTEGER NOT NULL DEFAULT 0,
        is_video_off INTEGER NOT NULL DEFAULT 0,
        joined_at TEXT,
        left_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_local_part_call ON local_call_participants(call_id);
      CREATE INDEX IF NOT EXISTS idx_local_part_phone ON local_call_participants(user_phone);
    `);

    // Additive column migrations for existing SQLite databases
    try { db.exec('ALTER TABLE local_call_records ADD COLUMN group_id TEXT;'); } catch {}
    try { db.exec('ALTER TABLE local_call_records ADD COLUMN is_group INTEGER NOT NULL DEFAULT 0;'); } catch {}
    try { db.exec('ALTER TABLE local_call_records ADD COLUMN group_name TEXT;'); } catch {}
    db.exec('CREATE INDEX IF NOT EXISTS idx_local_calls_group ON local_call_records(group_id);');

    // 6. Stored Media table
    db.exec(`
      CREATE TABLE IF NOT EXISTS local_stored_media (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        object_key TEXT NOT NULL UNIQUE,
        mime_type TEXT NOT NULL,
        byte_size INTEGER NOT NULL,
        base64_data TEXT NOT NULL,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_local_media_key ON local_stored_media(object_key);
    `);

    // 7. Chat Categories & Organization
    db.exec(`
      CREATE TABLE IF NOT EXISTS local_chat_categories (
        id TEXT PRIMARY KEY,
        user_phone TEXT NOT NULL,
        name TEXT NOT NULL,
        color TEXT NOT NULL DEFAULT '#00a884',
        icon TEXT,
        order_idx INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        UNIQUE(user_phone, name)
      );
      CREATE INDEX IF NOT EXISTS idx_local_categories_user ON local_chat_categories(user_phone);

      CREATE TABLE IF NOT EXISTS local_user_chat_categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_phone TEXT NOT NULL,
        conversation_id TEXT NOT NULL,
        category_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        UNIQUE(user_phone, conversation_id, category_id)
      );
      CREATE INDEX IF NOT EXISTS idx_local_ucc_user ON local_user_chat_categories(user_phone);
      CREATE INDEX IF NOT EXISTS idx_local_ucc_conv ON local_user_chat_categories(conversation_id);

      CREATE TABLE IF NOT EXISTS local_user_chat_themes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_phone TEXT NOT NULL,
        conversation_id TEXT NOT NULL,
        theme_config_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(user_phone, conversation_id)
      );
      CREATE INDEX IF NOT EXISTS idx_local_uct_lookup ON local_user_chat_themes(user_phone, conversation_id);

      CREATE TABLE IF NOT EXISTS local_user_ringtone_settings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_phone TEXT NOT NULL UNIQUE,
        voice_ringtone_id TEXT NOT NULL DEFAULT 'zolo-pulse',
        video_ringtone_id TEXT NOT NULL DEFAULT 'classic-bell',
        group_ringtone_id TEXT NOT NULL DEFAULT 'neon-cyber',
        volume REAL NOT NULL DEFAULT 0.85,
        vibration_enabled INTEGER NOT NULL DEFAULT 1,
        custom_ringtones_json TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_local_ringtone_phone ON local_user_ringtone_settings(user_phone);

      CREATE TABLE IF NOT EXISTS local_ad_campaigns (
        id TEXT PRIMARY KEY,
        advertiser_phone TEXT NOT NULL,
        title TEXT NOT NULL,
        advertiser_name TEXT NOT NULL,
        image_url TEXT NOT NULL,
        body TEXT NOT NULL,
        subtitle TEXT NOT NULL DEFAULT '',
        destination_url TEXT NOT NULL,
        cta_text TEXT NOT NULL,
        logo_url TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        moderation_note TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_local_ads_feed ON local_ad_campaigns(status, updated_at);
      CREATE INDEX IF NOT EXISTS idx_local_ads_owner ON local_ad_campaigns(advertiser_phone, created_at);

      CREATE TABLE IF NOT EXISTS local_ad_visit_verifications (
        id TEXT PRIMARY KEY,
        advertiser_phone TEXT NOT NULL,
        submission_id TEXT NOT NULL,
        started_at TEXT NOT NULL,
        completed_at TEXT,
        consumed_at TEXT,
        expires_at TEXT NOT NULL,
        UNIQUE(advertiser_phone, submission_id)
      );
      CREATE INDEX IF NOT EXISTS idx_local_ad_visit_verifications_expiry
        ON local_ad_visit_verifications(expires_at);

      CREATE TABLE IF NOT EXISTS local_ad_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        campaign_id TEXT NOT NULL REFERENCES local_ad_campaigns(id) ON DELETE CASCADE,
        event_type TEXT NOT NULL,
        viewer_key TEXT NOT NULL,
        event_key TEXT NOT NULL,
        created_at TEXT NOT NULL,
        UNIQUE(campaign_id, event_type, viewer_key, event_key)
      );
      CREATE INDEX IF NOT EXISTS idx_local_ad_events_campaign ON local_ad_events(campaign_id, event_type);

      CREATE TABLE IF NOT EXISTS local_ad_reports (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        campaign_id TEXT NOT NULL REFERENCES local_ad_campaigns(id) ON DELETE CASCADE,
        reporter_key TEXT NOT NULL,
        reason TEXT NOT NULL,
        created_at TEXT NOT NULL,
        UNIQUE(campaign_id, reporter_key)
      );

      CREATE TABLE IF NOT EXISTS local_communities (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        image_url TEXT,
        category TEXT NOT NULL DEFAULT 'General',
        privacy TEXT NOT NULL CHECK (privacy IN ('public', 'private')),
        created_by TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_local_communities_public
        ON local_communities(privacy, created_at);

      CREATE TABLE IF NOT EXISTS local_community_members (
        community_id TEXT NOT NULL REFERENCES local_communities(id) ON DELETE CASCADE,
        member_phone TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'moderator', 'member')),
        joined_at TEXT NOT NULL,
        PRIMARY KEY (community_id, member_phone)
      );
      CREATE INDEX IF NOT EXISTS idx_local_community_members_phone
        ON local_community_members(member_phone);

      CREATE TABLE IF NOT EXISTS local_community_groups (
        community_id TEXT NOT NULL REFERENCES local_communities(id) ON DELETE CASCADE,
        conversation_id TEXT NOT NULL UNIQUE REFERENCES local_conversations(id) ON DELETE CASCADE,
        created_at TEXT NOT NULL,
        PRIMARY KEY (community_id, conversation_id)
      );

      CREATE TABLE IF NOT EXISTS local_community_announcements (
        id TEXT PRIMARY KEY,
        community_id TEXT NOT NULL REFERENCES local_communities(id) ON DELETE CASCADE,
        author_phone TEXT NOT NULL,
        author_name TEXT NOT NULL,
        body TEXT NOT NULL,
        pinned INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_local_community_announcements_feed
        ON local_community_announcements(community_id, pinned, created_at);

      CREATE TABLE IF NOT EXISTS local_community_join_requests (
        community_id TEXT NOT NULL REFERENCES local_communities(id) ON DELETE CASCADE,
        requester_phone TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected')),
        requested_at TEXT NOT NULL,
        reviewed_at TEXT,
        reviewed_by TEXT,
        PRIMARY KEY (community_id, requester_phone)
      );
      CREATE INDEX IF NOT EXISTS idx_local_community_join_requests_pending
        ON local_community_join_requests(community_id, status, requested_at);

      CREATE TABLE IF NOT EXISTS local_community_invites (
        id TEXT PRIMARY KEY,
        community_id TEXT NOT NULL REFERENCES local_communities(id) ON DELETE CASCADE,
        token_hash TEXT NOT NULL UNIQUE,
        created_by TEXT NOT NULL,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        revoked_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_local_community_invites_community
        ON local_community_invites(community_id, expires_at);
    `);

    localDbInstance = db;
  }
  return localDbInstance;
}
