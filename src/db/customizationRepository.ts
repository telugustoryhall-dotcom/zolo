import { getLocalDb } from './localDatabase.ts';
import { getSupabaseServerClient } from '../lib/supabaseServer.ts';
import type { ChatCategory, ChatThemeConfig, RingtoneItem, RingtonePreferences } from '../types/chat.ts';

export const SYSTEM_CATEGORIES: ChatCategory[] = [
  { id: 'all', name: 'All', color: '#00a884', isSystem: true, order: 0 },
  { id: 'unread', name: 'Unread', color: '#10b981', isSystem: true, order: 1 },
];

export const DEFAULT_BUILTIN_CATEGORIES: ChatCategory[] = [
  { id: 'personal', name: 'Personal', color: '#3b82f6', isSystem: false, order: 2 },
  { id: 'work', name: 'Work', color: '#8b5cf6', isSystem: false, order: 3 },
  { id: 'study', name: 'Study', color: '#00a884', isSystem: false, order: 4 },
  { id: 'family', name: 'Family', color: '#ec4899', isSystem: false, order: 5 },
  { id: 'friends', name: 'Friends', color: '#f59e0b', isSystem: false, order: 6 },
  { id: 'important', name: 'Important', color: '#ef4444', isSystem: false, order: 7 },
];

export const DEFAULT_RINGTONE_PREFS: RingtonePreferences = {
  voiceCallRingtoneId: 'zolo-pulse',
  videoCallRingtoneId: 'classic-bell',
  groupCallRingtoneId: 'neon-cyber',
  volume: 0.85,
  vibrationEnabled: true,
  customRingtones: [],
};

// ============================================================================
// 1. CHAT CATEGORIES REPOSITORY
// ============================================================================

export async function fetchUserCategoriesAndMap(userPhone: string): Promise<{
  categories: ChatCategory[];
  chatCategoryMap: Record<string, string[]>;
}> {
  const normPhone = userPhone.trim();
  const customCats: ChatCategory[] = [];
  const chatMap: Record<string, string[]> = {};

  const supabase = getSupabaseServerClient();
  let supabaseSuccess = false;

  if (supabase) {
    try {
      const [catsRes, mapRes] = await Promise.all([
        supabase
          .from('chat_categories')
          .select('*')
          .eq('user_phone', normPhone)
          .order('order_idx', { ascending: true }),
        supabase
          .from('user_chat_categories')
          .select('*')
          .eq('user_phone', normPhone),
      ]);

      if (!catsRes.error && catsRes.data) {
        for (const row of catsRes.data as Array<{
          id: string;
          name: string;
          color: string;
          icon?: string;
          order_idx: number;
        }>) {
          customCats.push({
            id: row.id,
            name: row.name,
            color: row.color,
            icon: row.icon,
            order: row.order_idx,
            isSystem: false,
          });
        }
      }

      if (!mapRes.error && mapRes.data) {
        for (const row of mapRes.data as Array<{
          conversation_id: string;
          category_id: string;
        }>) {
          if (!chatMap[row.conversation_id]) {
            chatMap[row.conversation_id] = [];
          }
          if (!chatMap[row.conversation_id].includes(row.category_id)) {
            chatMap[row.conversation_id].push(row.category_id);
          }
        }
      }
      supabaseSuccess = true;
    } catch {
      // Fall through to SQLite
    }
  }

  if (!supabaseSuccess) {
    try {
      const ldb = getLocalDb();
      const catRows = ldb
        .prepare('SELECT id, name, color, icon, order_idx FROM local_chat_categories WHERE user_phone = ? ORDER BY order_idx ASC')
        .all(normPhone) as Array<{
        id: string;
        name: string;
        color: string;
        icon?: string;
        order_idx: number;
      }>;

      for (const row of catRows) {
        customCats.push({
          id: row.id,
          name: row.name,
          color: row.color,
          icon: row.icon,
          order: row.order_idx,
          isSystem: false,
        });
      }

      const mapRows = ldb
        .prepare('SELECT conversation_id, category_id FROM local_user_chat_categories WHERE user_phone = ?')
        .all(normPhone) as Array<{ conversation_id: string; category_id: string }>;

      for (const row of mapRows) {
        if (!chatMap[row.conversation_id]) {
          chatMap[row.conversation_id] = [];
        }
        if (!chatMap[row.conversation_id].includes(row.category_id)) {
          chatMap[row.conversation_id].push(row.category_id);
        }
      }
    } catch {
      // Ignore
    }
  }

  // Combine default builtins + custom user categories (avoiding duplicate names/IDs)
  const allCategories = [...SYSTEM_CATEGORIES, ...DEFAULT_BUILTIN_CATEGORIES];
  const existingIds = new Set(allCategories.map((c) => c.id));
  const existingNames = new Set(allCategories.map((c) => c.name.toLowerCase()));

  for (const cat of customCats) {
    if (!existingIds.has(cat.id) && !existingNames.has(cat.name.toLowerCase())) {
      allCategories.push(cat);
      existingIds.add(cat.id);
    }
  }

  return { categories: allCategories, chatCategoryMap: chatMap };
}

export async function createCustomCategory(params: {
  userPhone: string;
  name: string;
  color?: string;
  icon?: string;
}): Promise<ChatCategory> {
  const normPhone = params.userPhone.trim();
  const trimName = params.name.trim();
  const color = params.color || '#00a884';
  const id = `cat_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const now = new Date().toISOString();

  const newCat: ChatCategory = {
    id,
    name: trimName,
    color,
    icon: params.icon,
    isSystem: false,
  };

  const supabase = getSupabaseServerClient();
  if (supabase) {
    const { error } = await supabase.from('chat_categories').insert({
        id,
        user_phone: normPhone,
        name: trimName,
        color,
        icon: params.icon || null,
        created_at: now,
      });
    if (error) throw new Error(`Could not create chat category: ${error.message}`);
  } else {
    const ldb = getLocalDb();
    ldb.prepare(`
      INSERT OR REPLACE INTO local_chat_categories (id, user_phone, name, color, icon, order_idx, created_at)
      VALUES (?, ?, ?, ?, ?, 99, ?)
    `).run(id, normPhone, trimName, color, params.icon || null, now);
  }

  return newCat;
}

export async function updateCustomCategory(params: {
  userPhone: string;
  categoryId: string;
  name?: string;
  color?: string;
}): Promise<{ success: boolean }> {
  const normPhone = params.userPhone.trim();
  const supabase = getSupabaseServerClient();

  const updates: Record<string, unknown> = {};
  if (params.name) updates.name = params.name.trim();
  if (params.color) updates.color = params.color;

  if (Object.keys(updates).length === 0) return { success: true };

  if (supabase) {
    try {
      await supabase
        .from('chat_categories')
        .update(updates)
        .eq('id', params.categoryId)
        .eq('user_phone', normPhone);
    } catch {}
  }

  try {
    const ldb = getLocalDb();
    if (params.name && params.color) {
      ldb.prepare('UPDATE local_chat_categories SET name = ?, color = ? WHERE id = ? AND user_phone = ?')
        .run(params.name.trim(), params.color, params.categoryId, normPhone);
    } else if (params.name) {
      ldb.prepare('UPDATE local_chat_categories SET name = ? WHERE id = ? AND user_phone = ?')
        .run(params.name.trim(), params.categoryId, normPhone);
    } else if (params.color) {
      ldb.prepare('UPDATE local_chat_categories SET color = ? WHERE id = ? AND user_phone = ?')
        .run(params.color, params.categoryId, normPhone);
    }
  } catch {}

  return { success: true };
}

export async function deleteCustomCategory(userPhone: string, categoryId: string): Promise<{ success: boolean }> {
  const normPhone = userPhone.trim();
  const supabase = getSupabaseServerClient();

  if (supabase) {
    try {
      await supabase
        .from('user_chat_categories')
        .delete()
        .eq('category_id', categoryId)
        .eq('user_phone', normPhone);

      await supabase
        .from('chat_categories')
        .delete()
        .eq('id', categoryId)
        .eq('user_phone', normPhone);
    } catch {}
  }

  try {
    const ldb = getLocalDb();
    ldb.prepare('DELETE FROM local_user_chat_categories WHERE category_id = ? AND user_phone = ?')
      .run(categoryId, normPhone);
    ldb.prepare('DELETE FROM local_chat_categories WHERE id = ? AND user_phone = ?')
      .run(categoryId, normPhone);
  } catch {}

  return { success: true };
}

export async function saveChatCategoryAssignments(params: {
  userPhone: string;
  conversationId: string;
  categoryIds: string[];
}): Promise<{ conversationId: string; categoryIds: string[] }> {
  const normPhone = params.userPhone.trim();
  const convId = params.conversationId.trim();
  const catIds = Array.from(new Set(params.categoryIds)).filter(
    (c) => c !== 'all' && c !== 'unread'
  );
  const now = new Date().toISOString();

  const supabase = getSupabaseServerClient();
  if (supabase) {
    const builtinIds = new Set(DEFAULT_BUILTIN_CATEGORIES.map((category) => category.id));
    const customIds = catIds.filter((categoryId) => !builtinIds.has(categoryId));
    if (customIds.length > 0) {
      const { data, error } = await supabase
        .from('chat_categories')
        .select('id')
        .eq('user_phone', normPhone)
        .in('id', customIds);
      if (error) throw new Error(`Could not validate chat categories: ${error.message}`);
      if ((data || []).length !== customIds.length) {
        throw new Error('One or more categories do not belong to this account.');
      }
    }

    const { error: deleteError } = await supabase
      .from('user_chat_categories')
      .delete()
      .eq('user_phone', normPhone)
      .eq('conversation_id', convId);
    if (deleteError) throw new Error(`Could not update chat category: ${deleteError.message}`);
    if (catIds.length > 0) {
      const rows = catIds.map((catId) => ({
        user_phone: normPhone,
        conversation_id: convId,
        category_id: catId,
        created_at: now,
      }));
      const { error } = await supabase.from('user_chat_categories').insert(rows);
      if (error) throw new Error(`Could not assign chat category: ${error.message}`);
    }
  } else {
    const ldb = getLocalDb();
    const builtinIds = new Set(DEFAULT_BUILTIN_CATEGORIES.map((category) => category.id));
    const customIds = catIds.filter((categoryId) => !builtinIds.has(categoryId));
    if (customIds.length > 0) {
      const placeholders = customIds.map(() => '?').join(',');
      const ownedCategories = ldb.prepare(`
        SELECT id FROM local_chat_categories
        WHERE user_phone = ? AND id IN (${placeholders})
      `).all(normPhone, ...customIds) as Array<{ id: string }>;
      if (ownedCategories.length !== customIds.length) {
        throw new Error('One or more categories do not belong to this account.');
      }
    }
    ldb.prepare('DELETE FROM local_user_chat_categories WHERE user_phone = ? AND conversation_id = ?')
      .run(normPhone, convId);
    const stmt = ldb.prepare(
      'INSERT OR IGNORE INTO local_user_chat_categories (user_phone, conversation_id, category_id, created_at) VALUES (?, ?, ?, ?)'
    );
    for (const catId of catIds) {
      stmt.run(normPhone, convId, catId, now);
    }
  }

  return { conversationId: convId, categoryIds: catIds };
}

// ============================================================================
// 2. INDIVIDUAL CHAT THEMES REPOSITORY
// ============================================================================

export async function fetchUserChatThemes(userPhone: string): Promise<Record<string, ChatThemeConfig>> {
  const normPhone = userPhone.trim();
  const themesMap: Record<string, ChatThemeConfig> = {};

  const supabase = getSupabaseServerClient();
  let supabaseSuccess = false;

  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('user_chat_themes')
        .select('conversation_id, theme_config_json')
        .eq('user_phone', normPhone);

      if (!error && data) {
        for (const row of data as Array<{ conversation_id: string; theme_config_json: string }>) {
          try {
            themesMap[row.conversation_id] = JSON.parse(row.theme_config_json);
          } catch {}
        }
        supabaseSuccess = true;
      }
    } catch {}
  }

  if (!supabaseSuccess) {
    try {
      const ldb = getLocalDb();
      const rows = ldb
        .prepare('SELECT conversation_id, theme_config_json FROM local_user_chat_themes WHERE user_phone = ?')
        .all(normPhone) as Array<{ conversation_id: string; theme_config_json: string }>;

      for (const row of rows) {
        try {
          themesMap[row.conversation_id] = JSON.parse(row.theme_config_json);
        } catch {}
      }
    } catch {}
  }

  return themesMap;
}

export async function saveUserChatTheme(params: {
  userPhone: string;
  conversationId: string;
  theme: ChatThemeConfig;
}): Promise<{ conversationId: string; theme: ChatThemeConfig }> {
  const normPhone = params.userPhone.trim();
  const convId = params.conversationId.trim();
  const themeJson = JSON.stringify(params.theme);
  const now = new Date().toISOString();

  const supabase = getSupabaseServerClient();
  if (supabase) {
    try {
      await supabase.from('user_chat_themes').upsert(
        {
          user_phone: normPhone,
          conversation_id: convId,
          theme_config_json: themeJson,
          updated_at: now,
        },
        { onConflict: 'user_phone,conversation_id' }
      );
    } catch {}
  }

  try {
    const ldb = getLocalDb();
    ldb.prepare(`
      INSERT INTO local_user_chat_themes (user_phone, conversation_id, theme_config_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(user_phone, conversation_id) DO UPDATE SET
        theme_config_json = excluded.theme_config_json,
        updated_at = excluded.updated_at
    `).run(normPhone, convId, themeJson, now, now);
  } catch {}

  return { conversationId: convId, theme: params.theme };
}

export async function deleteUserChatTheme(userPhone: string, conversationId: string): Promise<{ success: boolean }> {
  const normPhone = userPhone.trim();
  const convId = conversationId.trim();

  const supabase = getSupabaseServerClient();
  if (supabase) {
    try {
      await supabase
        .from('user_chat_themes')
        .delete()
        .eq('user_phone', normPhone)
        .eq('conversation_id', convId);
    } catch {}
  }

  try {
    const ldb = getLocalDb();
    ldb.prepare('DELETE FROM local_user_chat_themes WHERE user_phone = ? AND conversation_id = ?')
      .run(normPhone, convId);
  } catch {}

  return { success: true };
}

// ============================================================================
// 3. USER RINGTONE SETTINGS REPOSITORY
// ============================================================================

export async function fetchUserRingtoneSettings(userPhone: string): Promise<RingtonePreferences> {
  const normPhone = userPhone.trim();
  let result: RingtonePreferences = { ...DEFAULT_RINGTONE_PREFS };

  const supabase = getSupabaseServerClient();
  let supabaseSuccess = false;

  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('user_ringtone_settings')
        .select('*')
        .eq('user_phone', normPhone)
        .maybeSingle();

      if (!error && data) {
        let customList: RingtoneItem[] = [];
        try {
          customList = JSON.parse(data.custom_ringtones_json || '[]');
        } catch {}

        result = {
          voiceCallRingtoneId: data.voice_ringtone_id || DEFAULT_RINGTONE_PREFS.voiceCallRingtoneId,
          videoCallRingtoneId: data.video_ringtone_id || DEFAULT_RINGTONE_PREFS.videoCallRingtoneId,
          groupCallRingtoneId: data.group_ringtone_id || DEFAULT_RINGTONE_PREFS.groupCallRingtoneId,
          volume: Number(data.volume ?? DEFAULT_RINGTONE_PREFS.volume),
          vibrationEnabled: Boolean(data.vibration_enabled ?? true),
          customRingtones: customList,
        };
        supabaseSuccess = true;
      }
    } catch {}
  }

  if (!supabaseSuccess) {
    try {
      const ldb = getLocalDb();
      const row = ldb
        .prepare('SELECT * FROM local_user_ringtone_settings WHERE user_phone = ?')
        .get(normPhone) as {
        voice_ringtone_id?: string;
        video_ringtone_id?: string;
        group_ringtone_id?: string;
        volume?: number;
        vibration_enabled?: number;
        custom_ringtones_json?: string;
      } | undefined;

      if (row) {
        let customList: RingtoneItem[] = [];
        try {
          customList = JSON.parse(row.custom_ringtones_json || '[]');
        } catch {}

        result = {
          voiceCallRingtoneId: row.voice_ringtone_id || DEFAULT_RINGTONE_PREFS.voiceCallRingtoneId,
          videoCallRingtoneId: row.video_ringtone_id || DEFAULT_RINGTONE_PREFS.videoCallRingtoneId,
          groupCallRingtoneId: row.group_ringtone_id || DEFAULT_RINGTONE_PREFS.groupCallRingtoneId,
          volume: Number(row.volume ?? DEFAULT_RINGTONE_PREFS.volume),
          vibrationEnabled: Boolean(row.vibration_enabled ?? 1),
          customRingtones: customList,
        };
      }
    } catch {}
  }

  return result;
}

export async function saveUserRingtoneSettings(
  userPhone: string,
  prefs: Partial<RingtonePreferences>
): Promise<RingtonePreferences> {
  const normPhone = userPhone.trim();
  const current = await fetchUserRingtoneSettings(normPhone);

  const updated: RingtonePreferences = {
    ...current,
    ...prefs,
    customRingtones: prefs.customRingtones || current.customRingtones,
  };

  const customJson = JSON.stringify(updated.customRingtones);
  const now = new Date().toISOString();

  const supabase = getSupabaseServerClient();
  if (supabase) {
    try {
      await supabase.from('user_ringtone_settings').upsert(
        {
          user_phone: normPhone,
          voice_ringtone_id: updated.voiceCallRingtoneId,
          video_ringtone_id: updated.videoCallRingtoneId,
          group_ringtone_id: updated.groupCallRingtoneId,
          volume: updated.volume,
          vibration_enabled: updated.vibrationEnabled,
          custom_ringtones_json: customJson,
          updated_at: now,
        },
        { onConflict: 'user_phone' }
      );
    } catch {}
  }

  try {
    const ldb = getLocalDb();
    ldb.prepare(`
      INSERT INTO local_user_ringtone_settings (
        user_phone, voice_ringtone_id, video_ringtone_id, group_ringtone_id, volume, vibration_enabled, custom_ringtones_json, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_phone) DO UPDATE SET
        voice_ringtone_id = excluded.voice_ringtone_id,
        video_ringtone_id = excluded.video_ringtone_id,
        group_ringtone_id = excluded.group_ringtone_id,
        volume = excluded.volume,
        vibration_enabled = excluded.vibration_enabled,
        custom_ringtones_json = excluded.custom_ringtones_json,
        updated_at = excluded.updated_at
    `).run(
      normPhone,
      updated.voiceCallRingtoneId,
      updated.videoCallRingtoneId,
      updated.groupCallRingtoneId,
      updated.volume,
      updated.vibrationEnabled ? 1 : 0,
      customJson,
      now,
      now
    );
  } catch {}

  return updated;
}
