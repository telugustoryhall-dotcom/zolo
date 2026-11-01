import React, { useEffect, useState } from 'react';
import {
  CalendarDays,
  Check,
  ClipboardList,
  Loader2,
  Plus,
  StickyNote,
  Trash2,
  X,
} from 'lucide-react';
import type { Contact } from '../types/chat';
import { authApi } from '../utils/authApi';

type WorkspaceTab = 'tasks' | 'notes' | 'events';
type TaskPriority = 'low' | 'medium' | 'high';
type TaskStatus = 'pending' | 'in_progress' | 'completed';

interface WorkspaceTask {
  id: string;
  title: string;
  assignedTo?: string;
  dueDate?: string;
  priority: TaskPriority;
  status: TaskStatus;
}

interface WorkspaceNote {
  id: string;
  title: string;
  content: string;
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
    priority?: TaskPriority;
  } | null;
}

export const GroupWorkspaceModal: React.FC<GroupWorkspaceModalProps> = ({
  isOpen,
  onClose,
  contact,
  theme,
  initialTask,
}) => {
  const isDark = theme === 'dark';
  const [tab, setTab] = useState<WorkspaceTab>('tasks');
  const [tasks, setTasks] = useState<WorkspaceTask[]>([]);
  const [notes, setNotes] = useState<WorkspaceNote[]>([]);
  const [events, setEvents] = useState<WorkspaceEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [taskTitle, setTaskTitle] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('medium');
  const [noteTitle, setNoteTitle] = useState('');
  const [noteContent, setNoteContent] = useState('');
  const [editingNoteId, setEditingNoteId] = useState<string | undefined>();
  const [eventTitle, setEventTitle] = useState('');
  const [eventDescription, setEventDescription] = useState('');
  const [eventTime, setEventTime] = useState('');
  const [eventLocation, setEventLocation] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    setError('');
    Promise.all([
      authApi.getTasks(contact.id),
      authApi.getNotes(contact.id),
      authApi.getEvents(contact.id),
    ])
      .then(([taskResult, noteResult, eventResult]) => {
        setTasks(taskResult.tasks as WorkspaceTask[]);
        setNotes(noteResult.notes as WorkspaceNote[]);
        setEvents(eventResult.events as WorkspaceEvent[]);
      })
      .catch(() => setError('Could not load this conversation workspace.'))
      .finally(() => setLoading(false));
  }, [contact.id, isOpen]);

  useEffect(() => {
    if (!isOpen || !initialTask) return;
    setTab('tasks');
    setTaskTitle(initialTask.title);
    setAssignedTo(initialTask.assignedTo || '');
    setDueDate(initialTask.dueDate || '');
    setPriority(initialTask.priority || 'medium');
  }, [initialTask, isOpen]);

  const handleCreateTask = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!taskTitle.trim()) return;
    setSaving(true);
    setError('');
    try {
      const result = await authApi.createTask(contact.id, {
        title: taskTitle.trim(),
        assignedTo: assignedTo.trim() || undefined,
        dueDate: dueDate || undefined,
        priority,
      });
      setTasks((current) => [result.task as WorkspaceTask, ...current]);
      setTaskTitle('');
      setAssignedTo('');
      setDueDate('');
      setPriority('medium');
    } catch {
      setError('Could not save the task. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleTaskStatus = async (task: WorkspaceTask) => {
    const nextStatus: TaskStatus = task.status === 'completed' ? 'pending' : 'completed';
    try {
      const result = await authApi.updateTask(contact.id, task.id, { status: nextStatus });
      setTasks((current) => current.map((item) => item.id === task.id ? result.task as WorkspaceTask : item));
    } catch {
      setError('Could not update the task. Please try again.');
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    try {
      await authApi.deleteTask(contact.id, taskId);
      setTasks((current) => current.filter((task) => task.id !== taskId));
    } catch {
      setError('Could not delete the task. Please try again.');
    }
  };

  const handleSaveNote = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!noteTitle.trim()) return;
    setSaving(true);
    setError('');
    try {
      const result = await authApi.saveNote(contact.id, {
        id: editingNoteId,
        title: noteTitle.trim(),
        content: noteContent,
      });
      setNotes((current) => [result.note as WorkspaceNote, ...current.filter((note) => note.id !== result.note.id)]);
      setNoteTitle('');
      setNoteContent('');
      setEditingNoteId(undefined);
    } catch {
      setError('Could not save the note. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteNote = async (noteId: string) => {
    try {
      await authApi.deleteNote(contact.id, noteId);
      setNotes((current) => current.filter((note) => note.id !== noteId));
      if (editingNoteId === noteId) {
        setEditingNoteId(undefined);
        setNoteTitle('');
        setNoteContent('');
      }
    } catch {
      setError('Could not delete the note. Please try again.');
    }
  };

  const handleCreateEvent = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!eventTitle.trim() || !eventTime) return;
    setSaving(true);
    setError('');
    try {
      const result = await authApi.createEvent(contact.id, {
        title: eventTitle.trim(),
        description: eventDescription.trim() || undefined,
        eventTime: new Date(eventTime).toISOString(),
        location: eventLocation.trim() || undefined,
      });
      setEvents((current) => [result.event as WorkspaceEvent, ...current]);
      setEventTitle('');
      setEventDescription('');
      setEventTime('');
      setEventLocation('');
    } catch {
      setError('Could not save the event. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteEvent = async (eventId: string) => {
    try {
      await authApi.deleteEvent(contact.id, eventId);
      setEvents((current) => current.filter((item) => item.id !== eventId));
    } catch {
      setError('Could not delete the event. Please try again.');
    }
  };

  if (!isOpen) return null;

  const panel = isDark
    ? 'border-[#2a3942] bg-[#111b21] text-white'
    : 'border-gray-200 bg-white text-gray-900';
  const field = isDark
    ? 'border-[#34434b] bg-[#202c33] placeholder:text-gray-500'
    : 'border-gray-300 bg-white placeholder:text-gray-400';
  const subtle = isDark ? 'border-[#2a3942] bg-[#182229]' : 'border-gray-200 bg-gray-50';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className={`flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl border shadow-2xl ${panel}`} role="dialog" aria-modal="true" aria-label={`${contact.name} workspace`}>
        <header className={`flex items-center justify-between border-b px-5 py-4 ${isDark ? 'border-[#2a3942] bg-[#202c33]' : 'border-gray-200 bg-gray-50'}`}>
          <div>
            <h2 className="text-base font-semibold">Workspace</h2>
            <p className="mt-0.5 text-xs opacity-60">{contact.name}</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-md p-2 opacity-70 hover:bg-black/10 hover:opacity-100" aria-label="Close workspace">
            <X className="h-4 w-4" />
          </button>
        </header>

        <nav className={`flex gap-1 border-b px-4 ${isDark ? 'border-[#2a3942]' : 'border-gray-200'}`} aria-label="Workspace sections">
          {([
            ['tasks', ClipboardList, 'Tasks'],
            ['notes', StickyNote, 'Notes'],
            ['events', CalendarDays, 'Events'],
          ] as const).map(([id, Icon, label]) => (
            <button key={id} type="button" onClick={() => setTab(id)} className={`flex items-center gap-2 border-b-2 px-3 py-3 text-sm ${tab === id ? 'border-emerald-500 text-emerald-500' : 'border-transparent opacity-65 hover:opacity-100'}`}>
              <Icon className="h-4 w-4" />{label}
            </button>
          ))}
        </nav>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {error && <p role="alert" className="mb-4 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-500">{error}</p>}
          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-emerald-500" /></div>
          ) : (
            <>
              {tab === 'tasks' && (
                <>
                  <form onSubmit={handleCreateTask} className={`mb-5 grid gap-2 rounded-lg border p-3 sm:grid-cols-2 ${subtle}`}>
                    <input value={taskTitle} onChange={(event) => setTaskTitle(event.target.value)} placeholder="Task title" aria-label="Task title" required className={`min-w-0 rounded-md border px-3 py-2 text-sm sm:col-span-2 ${field}`} />
                    <input value={assignedTo} onChange={(event) => setAssignedTo(event.target.value)} placeholder="Assign to" aria-label="Assign to" className={`min-w-0 rounded-md border px-3 py-2 text-sm ${field}`} />
                    <input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} aria-label="Due date" className={`min-w-0 rounded-md border px-3 py-2 text-sm ${field}`} />
                    <select value={priority} onChange={(event) => setPriority(event.target.value as TaskPriority)} aria-label="Priority" className={`rounded-md border px-3 py-2 text-sm capitalize ${field}`}>
                      <option value="low">Low priority</option><option value="medium">Medium priority</option><option value="high">High priority</option>
                    </select>
                    <button disabled={saving || !taskTitle.trim()} className="flex items-center justify-center gap-2 rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"><Plus className="h-4 w-4" />Add task</button>
                  </form>
                  {tasks.length === 0 ? <p className="py-8 text-center text-sm opacity-55">No tasks yet.</p> : <ul className="space-y-2">{tasks.map((task) => (
                    <li key={task.id} className={`flex items-center gap-3 rounded-lg border p-3 ${subtle}`}>
                      <button type="button" onClick={() => void handleTaskStatus(task)} aria-label={task.status === 'completed' ? 'Mark task incomplete' : 'Complete task'} className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border ${task.status === 'completed' ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-current/30'}`}>{task.status === 'completed' && <Check className="h-3 w-3" />}</button>
                      <div className="min-w-0 flex-1"><p className={`truncate text-sm font-medium ${task.status === 'completed' ? 'line-through opacity-50' : ''}`}>{task.title}</p><p className="mt-1 text-xs opacity-55">{[task.assignedTo, task.dueDate ? `Due ${task.dueDate}` : '', `${task.priority} priority`].filter(Boolean).join(' · ')}</p></div>
                      <button type="button" onClick={() => void handleDeleteTask(task.id)} aria-label="Delete task" className="rounded p-1.5 text-red-400 opacity-70 hover:bg-red-500/10 hover:opacity-100"><Trash2 className="h-4 w-4" /></button>
                    </li>
                  ))}</ul>}
                </>
              )}

              {tab === 'notes' && (
                <>
                  <form onSubmit={handleSaveNote} className={`mb-5 space-y-2 rounded-lg border p-3 ${subtle}`}>
                    <input value={noteTitle} onChange={(event) => setNoteTitle(event.target.value)} placeholder="Note title" aria-label="Note title" required className={`w-full rounded-md border px-3 py-2 text-sm ${field}`} />
                    <textarea value={noteContent} onChange={(event) => setNoteContent(event.target.value)} placeholder="Write a shared note..." aria-label="Note content" rows={4} className={`w-full resize-y rounded-md border px-3 py-2 text-sm ${field}`} />
                    <div className="flex justify-end gap-2"><button type="submit" disabled={saving || !noteTitle.trim()} className="flex items-center gap-2 rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50"><Plus className="h-4 w-4" />{editingNoteId ? 'Save changes' : 'Add note'}</button>{editingNoteId && <button type="button" onClick={() => { setEditingNoteId(undefined); setNoteTitle(''); setNoteContent(''); }} className="rounded-md px-3 py-2 text-sm opacity-70 hover:bg-black/10">Cancel</button>}</div>
                  </form>
                  {notes.length === 0 ? <p className="py-8 text-center text-sm opacity-55">No shared notes yet.</p> : <ul className="space-y-2">{notes.map((note) => (
                    <li key={note.id} className={`flex items-start gap-3 rounded-lg border p-3 ${subtle}`}>
                      <button type="button" onClick={() => { setEditingNoteId(note.id); setNoteTitle(note.title); setNoteContent(note.content); }} className="min-w-0 flex-1 text-left"><p className="text-sm font-medium">{note.title}</p><p className="mt-1 whitespace-pre-wrap text-sm opacity-70">{note.content}</p><p className="mt-2 text-xs opacity-45">Updated {new Date(note.updatedAt).toLocaleString()}</p></button>
                      <button type="button" onClick={() => void handleDeleteNote(note.id)} aria-label="Delete note" className="rounded p-1.5 text-red-400 opacity-70 hover:bg-red-500/10 hover:opacity-100"><Trash2 className="h-4 w-4" /></button>
                    </li>
                  ))}</ul>}
                </>
              )}

              {tab === 'events' && (
                <>
                  <form onSubmit={handleCreateEvent} className={`mb-5 grid gap-2 rounded-lg border p-3 sm:grid-cols-2 ${subtle}`}>
                    <input value={eventTitle} onChange={(event) => setEventTitle(event.target.value)} placeholder="Event title" aria-label="Event title" required className={`min-w-0 rounded-md border px-3 py-2 text-sm sm:col-span-2 ${field}`} />
                    <input type="datetime-local" value={eventTime} onChange={(event) => setEventTime(event.target.value)} aria-label="Event date and time" required className={`min-w-0 rounded-md border px-3 py-2 text-sm ${field}`} />
                    <input value={eventLocation} onChange={(event) => setEventLocation(event.target.value)} placeholder="Location (optional)" aria-label="Location" className={`min-w-0 rounded-md border px-3 py-2 text-sm ${field}`} />
                    <input value={eventDescription} onChange={(event) => setEventDescription(event.target.value)} placeholder="Description (optional)" aria-label="Description" className={`min-w-0 rounded-md border px-3 py-2 text-sm sm:col-span-2 ${field}`} />
                    <button disabled={saving || !eventTitle.trim() || !eventTime} className="flex items-center justify-center gap-2 rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50 sm:col-span-2"><Plus className="h-4 w-4" />Add event</button>
                  </form>
                  {events.length === 0 ? <p className="py-8 text-center text-sm opacity-55">No upcoming events.</p> : <ul className="space-y-2">{events.map((item) => (
                    <li key={item.id} className={`flex items-start gap-3 rounded-lg border p-3 ${subtle}`}>
                      <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" /><div className="min-w-0 flex-1"><p className="text-sm font-medium">{item.title}</p><p className="mt-1 text-xs opacity-60">{new Date(item.eventTime).toLocaleString()}{item.location ? ` · ${item.location}` : ''}</p>{item.description && <p className="mt-2 text-sm opacity-70">{item.description}</p>}</div>
                      <button type="button" onClick={() => void handleDeleteEvent(item.id)} aria-label="Delete event" className="rounded p-1.5 text-red-400 opacity-70 hover:bg-red-500/10 hover:opacity-100"><Trash2 className="h-4 w-4" /></button>
                    </li>
                  ))}</ul>}
                </>
              )}
            </>
          )}
        </div>
      </section>
    </div>
  );
};
