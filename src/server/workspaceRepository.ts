import crypto from 'node:crypto';
import { getLocalDb } from '../db/localDatabase.ts';
import { getSupabaseServerClient, isSupabaseConfigured } from '../lib/supabaseServer.ts';

export interface GroupTask {
  id: string;
  conversationId: string;
  title: string;
  assignedTo?: string;
  dueDate?: string;
  priority: 'low' | 'medium' | 'high';
  status: 'pending' | 'in_progress' | 'completed';
  createdBy: string;
  createdAt: string;
}

export interface GroupNote {
  id: string;
  conversationId: string;
  title: string;
  content: string;
  authorName: string;
  authorPhone: string;
  updatedAt: string;
  createdAt: string;
}

export interface GroupEvent {
  id: string;
  conversationId: string;
  title: string;
  description?: string;
  eventTime: string;
  location?: string;
  creatorPhone: string;
  attendees: string[];
  createdAt: string;
}

export interface ScheduledMessage {
  id: string;
  scheduleId: string;
  senderPhone: string;
  recipientPhone: string;
  conversationKey: string;
  text: string;
  mediaType: string;
  payloadJson?: string;
  scheduledFor: string;
  status: 'pending' | 'sent' | 'cancelled';
  createdAt: string;
}

let tablesInitialized = false;

export function ensureWorkspaceTables(): void {
  if (tablesInitialized) return;
  const db = getLocalDb();

  db.exec(`
    CREATE TABLE IF NOT EXISTS local_group_tasks (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      title TEXT NOT NULL,
      assigned_to TEXT,
      due_date TEXT,
      priority TEXT NOT NULL DEFAULT 'medium',
      status TEXT NOT NULL DEFAULT 'pending',
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_tasks_conv ON local_group_tasks(conversation_id);

    CREATE TABLE IF NOT EXISTS local_group_notes (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      author_name TEXT NOT NULL,
      author_phone TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_notes_conv ON local_group_notes(conversation_id);

    CREATE TABLE IF NOT EXISTS local_group_events (
      id TEXT PRIMARY KEY,
      conversation_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT,
      event_time TEXT NOT NULL,
      location TEXT,
      creator_phone TEXT NOT NULL,
      attendees_json TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_events_conv ON local_group_events(conversation_id);

    CREATE TABLE IF NOT EXISTS local_scheduled_messages (
      id TEXT PRIMARY KEY,
      schedule_id TEXT NOT NULL UNIQUE,
      sender_phone TEXT NOT NULL,
      recipient_phone TEXT NOT NULL,
      conversation_key TEXT NOT NULL,
      text TEXT NOT NULL,
      media_type TEXT NOT NULL DEFAULT 'text',
      payload_json TEXT,
      scheduled_for TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_sched_status ON local_scheduled_messages(status);
    CREATE INDEX IF NOT EXISTS idx_sched_time ON local_scheduled_messages(scheduled_for);
  `);

  tablesInitialized = true;
}

// ----------------------------------------------------
// TASKS
// ----------------------------------------------------

export async function fetchTasksForConversation(conversationId: string): Promise<GroupTask[]> {
  ensureWorkspaceTables();
  const db = getLocalDb();
  const rows = db
    .prepare('SELECT * FROM local_group_tasks WHERE conversation_id = ? ORDER BY created_at DESC')
    .all(conversationId) as Array<{
    id: string;
    conversation_id: string;
    title: string;
    assigned_to: string | null;
    due_date: string | null;
    priority: 'low' | 'medium' | 'high';
    status: 'pending' | 'in_progress' | 'completed';
    created_by: string;
    created_at: string;
  }>;

  return rows.map((r) => ({
    id: r.id,
    conversationId: r.conversation_id,
    title: r.title,
    assignedTo: r.assigned_to || undefined,
    dueDate: r.due_date || undefined,
    priority: r.priority,
    status: r.status,
    createdBy: r.created_by,
    createdAt: r.created_at,
  }));
}

export async function createGroupTaskInDb(data: {
  conversationId: string;
  title: string;
  assignedTo?: string;
  dueDate?: string;
  priority?: 'low' | 'medium' | 'high';
  createdBy: string;
}): Promise<GroupTask> {
  ensureWorkspaceTables();
  const id = `task_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  const now = new Date().toISOString();
  const priority = data.priority || 'medium';

  const db = getLocalDb();
  db.prepare(
    `INSERT INTO local_group_tasks (id, conversation_id, title, assigned_to, due_date, priority, status, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)`
  ).run(
    id,
    data.conversationId,
    data.title,
    data.assignedTo || null,
    data.dueDate || null,
    priority,
    data.createdBy,
    now
  );

  return {
    id,
    conversationId: data.conversationId,
    title: data.title,
    assignedTo: data.assignedTo,
    dueDate: data.dueDate,
    priority,
    status: 'pending',
    createdBy: data.createdBy,
    createdAt: now,
  };
}

export async function updateGroupTaskInDb(
  taskId: string,
  updates: Partial<Pick<GroupTask, 'title' | 'assignedTo' | 'dueDate' | 'priority' | 'status'>>
): Promise<GroupTask | null> {
  ensureWorkspaceTables();
  const db = getLocalDb();
  const existing = db
    .prepare('SELECT * FROM local_group_tasks WHERE id = ?')
    .get(taskId) as Record<string, unknown> | undefined;

  if (!existing) return null;

  const newTitle = String(updates.title !== undefined ? updates.title : existing.title || '');
  const newAssigned = (updates.assignedTo !== undefined ? updates.assignedTo : existing.assigned_to) ?? null;
  const newDueDate = (updates.dueDate !== undefined ? updates.dueDate : existing.due_date) ?? null;
  const newPriority = String(updates.priority !== undefined ? updates.priority : existing.priority || 'medium');
  const newStatus = String(updates.status !== undefined ? updates.status : existing.status || 'pending');

  db.prepare(
    `UPDATE local_group_tasks SET title = ?, assigned_to = ?, due_date = ?, priority = ?, status = ? WHERE id = ?`
  ).run(
    newTitle,
    newAssigned ? String(newAssigned) : null,
    newDueDate ? String(newDueDate) : null,
    newPriority,
    newStatus,
    taskId
  );

  return {
    id: taskId,
    conversationId: String(existing.conversation_id),
    title: String(newTitle),
    assignedTo: newAssigned ? String(newAssigned) : undefined,
    dueDate: newDueDate ? String(newDueDate) : undefined,
    priority: newPriority as 'low' | 'medium' | 'high',
    status: newStatus as 'pending' | 'in_progress' | 'completed',
    createdBy: String(existing.created_by),
    createdAt: String(existing.created_at),
  };
}

export async function deleteGroupTaskInDb(taskId: string): Promise<boolean> {
  ensureWorkspaceTables();
  const db = getLocalDb();
  const result = db.prepare('DELETE FROM local_group_tasks WHERE id = ?').run(taskId);
  return Number(result.changes) > 0;
}

// ----------------------------------------------------
// NOTES
// ----------------------------------------------------

export async function fetchNotesForConversation(conversationId: string): Promise<GroupNote[]> {
  ensureWorkspaceTables();
  const db = getLocalDb();
  const rows = db
    .prepare('SELECT * FROM local_group_notes WHERE conversation_id = ? ORDER BY updated_at DESC')
    .all(conversationId) as Array<{
    id: string;
    conversation_id: string;
    title: string;
    content: string;
    author_name: string;
    author_phone: string;
    updated_at: string;
    created_at: string;
  }>;

  return rows.map((r) => ({
    id: r.id,
    conversationId: r.conversation_id,
    title: r.title,
    content: r.content,
    authorName: r.author_name,
    authorPhone: r.author_phone,
    updatedAt: r.updated_at,
    createdAt: r.created_at,
  }));
}

export async function saveGroupNoteInDb(data: {
  id?: string;
  conversationId: string;
  title: string;
  content: string;
  authorName: string;
  authorPhone: string;
}): Promise<GroupNote> {
  ensureWorkspaceTables();
  const db = getLocalDb();
  const now = new Date().toISOString();
  const id = data.id || `note_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

  const existing = db.prepare('SELECT id FROM local_group_notes WHERE id = ?').get(id);
  if (existing) {
    db.prepare(
      `UPDATE local_group_notes SET title = ?, content = ?, updated_at = ? WHERE id = ?`
    ).run(data.title, data.content, now, id);
  } else {
    db.prepare(
      `INSERT INTO local_group_notes (id, conversation_id, title, content, author_name, author_phone, updated_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(id, data.conversationId, data.title, data.content, data.authorName, data.authorPhone, now, now);
  }

  return {
    id,
    conversationId: data.conversationId,
    title: data.title,
    content: data.content,
    authorName: data.authorName,
    authorPhone: data.authorPhone,
    updatedAt: now,
    createdAt: now,
  };
}

export async function deleteGroupNoteInDb(noteId: string): Promise<boolean> {
  ensureWorkspaceTables();
  const db = getLocalDb();
  const res = db.prepare('DELETE FROM local_group_notes WHERE id = ?').run(noteId);
  return Number(res.changes) > 0;
}

// ----------------------------------------------------
// EVENTS
// ----------------------------------------------------

export async function fetchEventsForConversation(conversationId: string): Promise<GroupEvent[]> {
  ensureWorkspaceTables();
  const db = getLocalDb();
  const rows = db
    .prepare('SELECT * FROM local_group_events WHERE conversation_id = ? ORDER BY event_time ASC')
    .all(conversationId) as Array<{
    id: string;
    conversation_id: string;
    title: string;
    description: string | null;
    event_time: string;
    location: string | null;
    creator_phone: string;
    attendees_json: string;
    created_at: string;
  }>;

  return rows.map((r) => {
    let attendees: string[] = [];
    try {
      attendees = JSON.parse(r.attendees_json || '[]');
    } catch {}
    return {
      id: r.id,
      conversationId: r.conversation_id,
      title: r.title,
      description: r.description || undefined,
      eventTime: r.event_time,
      location: r.location || undefined,
      creatorPhone: r.creator_phone,
      attendees,
      createdAt: r.created_at,
    };
  });
}

export async function createGroupEventInDb(data: {
  conversationId: string;
  title: string;
  description?: string;
  eventTime: string;
  location?: string;
  creatorPhone: string;
  attendees?: string[];
}): Promise<GroupEvent> {
  ensureWorkspaceTables();
  const id = `evt_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  const now = new Date().toISOString();
  const attendeesJson = JSON.stringify(data.attendees || [data.creatorPhone]);

  const db = getLocalDb();
  db.prepare(
    `INSERT INTO local_group_events (id, conversation_id, title, description, event_time, location, creator_phone, attendees_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    data.conversationId,
    data.title,
    data.description || null,
    data.eventTime,
    data.location || null,
    data.creatorPhone,
    attendeesJson,
    now
  );

  return {
    id,
    conversationId: data.conversationId,
    title: data.title,
    description: data.description,
    eventTime: data.eventTime,
    location: data.location,
    creatorPhone: data.creatorPhone,
    attendees: data.attendees || [data.creatorPhone],
    createdAt: now,
  };
}

export async function deleteGroupEventInDb(eventId: string): Promise<boolean> {
  ensureWorkspaceTables();
  const db = getLocalDb();
  const res = db.prepare('DELETE FROM local_group_events WHERE id = ?').run(eventId);
  return Number(res.changes) > 0;
}

// ----------------------------------------------------
// SCHEDULED MESSAGES
// ----------------------------------------------------

export async function scheduleMessageInDb(data: {
  senderPhone: string;
  recipientPhone: string;
  conversationKey: string;
  text: string;
  mediaType?: string;
  payloadJson?: string;
  scheduledFor: string;
}): Promise<ScheduledMessage> {
  ensureWorkspaceTables();
  const scheduleId = `sch_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  const now = new Date().toISOString();

  const db = getLocalDb();
  db.prepare(
    `INSERT INTO local_scheduled_messages (id, schedule_id, sender_phone, recipient_phone, conversation_key, text, media_type, payload_json, scheduled_for, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`
  ).run(
    scheduleId,
    scheduleId,
    data.senderPhone,
    data.recipientPhone,
    data.conversationKey,
    data.text,
    data.mediaType || 'text',
    data.payloadJson || null,
    data.scheduledFor,
    now
  );

  return {
    id: scheduleId,
    scheduleId,
    senderPhone: data.senderPhone,
    recipientPhone: data.recipientPhone,
    conversationKey: data.conversationKey,
    text: data.text,
    mediaType: data.mediaType || 'text',
    payloadJson: data.payloadJson,
    scheduledFor: data.scheduledFor,
    status: 'pending',
    createdAt: now,
  };
}

export async function fetchScheduledMessagesForSender(senderPhone: string): Promise<ScheduledMessage[]> {
  ensureWorkspaceTables();
  const db = getLocalDb();
  const rows = db
    .prepare('SELECT * FROM local_scheduled_messages WHERE sender_phone = ? AND status = ? ORDER BY scheduled_for ASC')
    .all(senderPhone, 'pending') as Array<{
    id: string;
    schedule_id: string;
    sender_phone: string;
    recipient_phone: string;
    conversation_key: string;
    text: string;
    media_type: string;
    payload_json: string | null;
    scheduled_for: string;
    status: 'pending' | 'sent' | 'cancelled';
    created_at: string;
  }>;

  return rows.map((r) => ({
    id: r.id,
    scheduleId: r.schedule_id,
    senderPhone: r.sender_phone,
    recipientPhone: r.recipient_phone,
    conversationKey: r.conversation_key,
    text: r.text,
    mediaType: r.media_type,
    payloadJson: r.payload_json || undefined,
    scheduledFor: r.scheduled_for,
    status: r.status,
    createdAt: r.created_at,
  }));
}

export async function cancelScheduledMessageInDb(scheduleId: string, senderPhone: string): Promise<boolean> {
  ensureWorkspaceTables();
  const db = getLocalDb();
  const res = db
    .prepare('UPDATE local_scheduled_messages SET status = ? WHERE (id = ? OR schedule_id = ?) AND sender_phone = ?')
    .run('cancelled', scheduleId, scheduleId, senderPhone);
  return Number(res.changes) > 0;
}

export async function getDueScheduledMessages(): Promise<ScheduledMessage[]> {
  ensureWorkspaceTables();
  const db = getLocalDb();
  const nowIso = new Date().toISOString();
  const rows = db
    .prepare('SELECT * FROM local_scheduled_messages WHERE status = ? AND scheduled_for <= ?')
    .all('pending', nowIso) as Array<{
    id: string;
    schedule_id: string;
    sender_phone: string;
    recipient_phone: string;
    conversation_key: string;
    text: string;
    media_type: string;
    payload_json: string | null;
    scheduled_for: string;
    status: 'pending' | 'sent' | 'cancelled';
    created_at: string;
  }>;

  return rows.map((r) => ({
    id: r.id,
    scheduleId: r.schedule_id,
    senderPhone: r.sender_phone,
    recipientPhone: r.recipient_phone,
    conversationKey: r.conversation_key,
    text: r.text,
    mediaType: r.media_type,
    payloadJson: r.payload_json || undefined,
    scheduledFor: r.scheduled_for,
    status: r.status,
    createdAt: r.created_at,
  }));
}

export async function markScheduledMessageSent(scheduleId: string): Promise<void> {
  ensureWorkspaceTables();
  const db = getLocalDb();
  db.prepare('UPDATE local_scheduled_messages SET status = ? WHERE id = ? OR schedule_id = ?').run(
    'sent',
    scheduleId,
    scheduleId
  );
}
