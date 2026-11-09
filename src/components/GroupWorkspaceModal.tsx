import React, { useEffect, useState } from 'react';
import { CalendarDays, CheckSquare, Loader2, Plus, Trash2, X } from 'lucide-react';
import type { Contact } from '../types/chat';
import { authApi } from '../utils/authApi';

interface WorkspaceTask {
  id: string;
  title: string;
  assignedTo?: string;
  dueDate?: string;
  priority: 'low' | 'medium' | 'high';
  status: 'pending' | 'in_progress' | 'completed';
}

interface WorkspaceNote {
  id: string;
  title: string;
  content: string;
  authorName: string;
  updatedAt: string;
}

interface WorkspaceEvent {
  id: string;
  title: string;
  description?: string;
  eventTime: string;
  location?: string;
}

interface GroupWorkspaceModalProps {
  isOpen: boolean;
  onClose: () => void;
  contact: Contact;
  theme: 'dark' | 'light';
  initialTask?: {
    title: string;
    assignedTo?: string;
    dueDate?: string;
    priority?: 'low' | 'medium' | 'high';
  } | null;
}

type WorkspaceTab = 'tasks' | 'notes' | 'events';

export const GroupWorkspaceModal: React.FC<GroupWorkspaceModalProps> = ({
  isOpen,
  onClose,
  contact,
  theme,
  initialTask,
}) => {
  const [tab, setTab] = useState<WorkspaceTab>('tasks');
  const [tasks, setTasks] = useState<WorkspaceTask[]>([]);
  const [notes, setNotes] = useState<WorkspaceNote[]>([]);
  const [events, setEvents] = useState<WorkspaceEvent[]>([]);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [eventTime, setEventTime] = useState('');
  const [location, setLocation] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isDark = theme === 'dark';

  const loadWorkspace = async () => {
    setLoading(true);
    setError(null);
    try {
      const [taskResult, noteResult, eventResult] = await Promise.all([
        authApi.getTasks(contact.id),
        authApi.getNotes(contact.id),
        authApi.getEvents(contact.id),
      ]);
      setTasks(taskResult.tasks);
      setNotes(noteResult.notes);
      setEvents(eventResult.events);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load this group workspace.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) void loadWorkspace();
  }, [contact.id, isOpen]);

  useEffect(() => {
    if (!initialTask) return;
    setTab('tasks');
    setTitle(initialTask.title);
    setDueDate(initialTask.dueDate || '');
  }, [initialTask]);

  const saveItem = async () => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle || saving) return;
    setSaving(true);
    setError(null);
    try {
      if (tab === 'tasks') {
        const { task } = await authApi.createTask(contact.id, {
          title: trimmedTitle,
          assignedTo: initialTask?.assignedTo,
          dueDate: dueDate || undefined,
          priority: initialTask?.priority || 'medium',
        });
        setTasks((previous) => [task, ...previous]);
      } else if (tab === 'notes') {
        const { note } = await authApi.saveNote(contact.id, {
          title: trimmedTitle,
          content: body.trim(),
        });
        setNotes((previous) => [note, ...previous]);
      } else {
        if (!eventTime) {
          setError('Choose a date and time for the event.');
          return;
        }
        const { event } = await authApi.createEvent(contact.id, {
          title: trimmedTitle,
          description: body.trim(),
          eventTime: new Date(eventTime).toISOString(),
          location: location.trim() || undefined,
        });
        setEvents((previous) => [event, ...previous]);
      }
      setTitle('');
      setBody('');
      setDueDate('');
      setEventTime('');
      setLocation('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save this item.');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  const panelClass = isDark
    ? 'bg-[#111b21] border-slate-700 text-white'
    : 'bg-white border-slate-200 text-slate-900';
  const fieldClass = `w-full rounded-lg border px-3 py-2 text-sm outline-none ${
    isDark ? 'bg-[#202c33] border-slate-700' : 'bg-slate-50 border-slate-200'
  }`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <section className={`flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border shadow-2xl ${panelClass}`}>
        <header className="flex items-center justify-between border-b border-slate-700/40 p-4">
          <div className="flex items-center gap-2">
            <CheckSquare className="h-5 w-5 text-[#00a884]" />
            <div>
              <h2 className="font-semibold">{contact.name} workspace</h2>
              <p className="text-xs text-slate-400">Shared tasks, notes, and events</p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close workspace" className="rounded-full p-2 hover:bg-slate-700/20">
            <X className="h-5 w-5" />
          </button>
        </header>

        <nav className="flex border-b border-slate-700/30">
          {(['tasks', 'notes', 'events'] as const).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setTab(item)}
              className={`flex-1 px-4 py-3 text-sm capitalize ${
                tab === item ? 'border-b-2 border-[#00a884] font-semibold text-[#00a884]' : 'text-slate-400'
              }`}
            >
              {item}
            </button>
          ))}
        </nav>

        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          <div className={`space-y-2 rounded-xl border p-3 ${isDark ? 'border-slate-700/50' : 'border-slate-200'}`}>
            <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder={`${tab === 'tasks' ? 'Task' : tab === 'notes' ? 'Note' : 'Event'} title`} className={fieldClass} />
            {tab === 'tasks' && (
              <div className="flex gap-2">
                <input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} className={fieldClass} aria-label="Task due date" />
              </div>
            )}
            {tab !== 'tasks' && (
              <textarea value={body} onChange={(event) => setBody(event.target.value)} placeholder={tab === 'notes' ? 'Write a shared note...' : 'Event details'} rows={3} className={fieldClass} />
            )}
            {tab === 'events' && (
              <>
                <input type="datetime-local" value={eventTime} onChange={(event) => setEventTime(event.target.value)} className={fieldClass} aria-label="Event date and time" />
                <input value={location} onChange={(event) => setLocation(event.target.value)} placeholder="Location (optional)" className={fieldClass} />
              </>
            )}
            <button type="button" onClick={() => void saveItem()} disabled={!title.trim() || saving} className="inline-flex items-center gap-2 rounded-lg bg-[#00a884] px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Add {tab.slice(0, -1)}
            </button>
          </div>

          {loading && <div className="flex justify-center p-8"><Loader2 className="h-5 w-5 animate-spin text-[#00a884]" /></div>}
          {error && <p role="alert" className="rounded-lg bg-rose-500/10 p-3 text-sm text-rose-400">{error}</p>}

          {!loading && tab === 'tasks' && tasks.map((task) => (
            <article key={task.id} className={`flex items-center gap-3 rounded-xl border p-3 ${isDark ? 'border-slate-700/40' : 'border-slate-200'}`}>
              <input
                type="checkbox"
                checked={task.status === 'completed'}
                onChange={async () => {
                  try {
                    const status = task.status === 'completed' ? 'pending' : 'completed';
                    await authApi.updateTask(contact.id, task.id, { status });
                    setTasks((previous) => previous.map((item) => item.id === task.id ? { ...item, status } : item));
                  } catch (err) {
                    setError(err instanceof Error ? err.message : 'Could not update task.');
                  }
                }}
              />
              <div className="min-w-0 flex-1">
                <p className={`truncate text-sm font-medium ${task.status === 'completed' ? 'line-through opacity-60' : ''}`}>{task.title}</p>
                <p className="text-xs text-slate-400">{task.dueDate ? `Due ${task.dueDate}` : task.priority}</p>
              </div>
              <button type="button" aria-label="Delete task" onClick={async () => {
                try {
                  await authApi.deleteTask(contact.id, task.id);
                  setTasks((previous) => previous.filter((item) => item.id !== task.id));
                } catch (err) {
                  setError(err instanceof Error ? err.message : 'Could not delete task.');
                }
              }} className="p-2 text-slate-400 hover:text-rose-400"><Trash2 className="h-4 w-4" /></button>
            </article>
          ))}

          {!loading && tab === 'notes' && notes.map((note) => (
            <article key={note.id} className={`rounded-xl border p-3 ${isDark ? 'border-slate-700/40' : 'border-slate-200'}`}>
              <h3 className="text-sm font-semibold">{note.title}</h3>
              <p className="mt-1 whitespace-pre-wrap text-sm text-slate-400">{note.content}</p>
              <p className="mt-2 text-[11px] text-slate-500">{note.authorName}</p>
            </article>
          ))}

          {!loading && tab === 'events' && events.map((event) => (
            <article key={event.id} className={`flex gap-3 rounded-xl border p-3 ${isDark ? 'border-slate-700/40' : 'border-slate-200'}`}>
              <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-[#00a884]" />
              <div>
                <h3 className="text-sm font-semibold">{event.title}</h3>
                <p className="text-xs text-slate-400">{new Date(event.eventTime).toLocaleString()}</p>
                {event.description && <p className="mt-1 text-sm text-slate-400">{event.description}</p>}
                {event.location && <p className="text-xs text-slate-500">{event.location}</p>}
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
};
