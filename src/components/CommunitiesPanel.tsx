import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Check,
  Globe2,
  LockKeyhole,
  Loader2,
  Megaphone,
  MessageSquare,
  Phone,
  Plus,
  Search,
  Settings,
  Send,
  ShieldCheck,
  CircleDashed,
  UsersRound,
  X,
} from 'lucide-react';
import { authApi } from '../utils/authApi';
import type { GroupConversationWireDto } from '../types/auth';
import type { SidebarTabType } from './Sidebar';
import type {
  CommunityDetail,
  CommunityDirectory,
  CommunityInvitePreview,
  CommunitySummary,
} from '../types/communities';

interface CommunitiesPanelProps {
  theme: 'dark' | 'light';
  onOpenGroup: (group: GroupConversationWireDto) => void;
  activeTab: SidebarTabType;
  onNavigateTab: (tab: SidebarTabType) => void;
}

const EMPTY_DIRECTORY: CommunityDirectory = { mine: [], discover: [] };

export const CommunitiesPanel: React.FC<CommunitiesPanelProps> = ({
  theme,
  onOpenGroup,
  activeTab,
  onNavigateTab,
}) => {
  const isDark = theme === 'dark';
  const [directory, setDirectory] = useState<CommunityDirectory>(EMPTY_DIRECTORY);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<CommunityDetail | null>(null);
  const [activeList, setActiveList] = useState<'mine' | 'discover'>('mine');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [invitePreview, setInvitePreview] = useState<CommunityInvitePreview | null>(null);
  const [inviteToken, setInviteToken] = useState('');
  const [inviteRequested, setInviteRequested] = useState(false);
  const [inviteUrl, setInviteUrl] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [groupDescription, setGroupDescription] = useState('');
  const [announcementBody, setAnnouncementBody] = useState('');
  const [newCommunity, setNewCommunity] = useState({
    name: '',
    description: '',
    category: 'General',
    privacy: 'public' as 'public' | 'private',
  });
  const panelClass = isDark
    ? 'bg-[#111b21] text-white'
    : 'bg-white text-slate-900';
  const mutedClass = isDark ? 'text-slate-400' : 'text-slate-500';
  const fieldClass = `w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-emerald-500 ${
    isDark ? 'border-white/10 bg-[#0b141a] text-white' : 'border-slate-200 bg-white text-slate-900'
  }`;

  const loadDirectory = async () => {
    setLoading(true);
    setError('');
    try {
      setDirectory(await authApi.fetchCommunities());
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load communities.');
    } finally {
      setLoading(false);
    }
  };

  const loadDetail = async (communityId: string) => {
    setDetailLoading(true);
    setError('');
    try {
      const result = await authApi.fetchCommunity(communityId);
      setDetail(result.detail);
    } catch (loadError) {
      setDetail(null);
      setError(loadError instanceof Error ? loadError.message : 'Could not load this community.');
    } finally {
      setDetailLoading(false);
    }
  };

  useEffect(() => {
    void loadDirectory();
    const token = new URLSearchParams(window.location.search).get('communityInvite');
    if (token) {
      setInviteToken(token);
      void authApi.fetchCommunityInvite(token)
        .then(({ preview }) => setInvitePreview(preview))
        .catch((inviteError: unknown) => {
          setError(inviteError instanceof Error ? inviteError.message : 'Could not load this community invitation.');
        });
    }
  }, []);

  useEffect(() => {
    setDetail(null);
    setInviteUrl('');
    if (selectedId) void loadDetail(selectedId);
  }, [selectedId]);

  const visibleCommunities = useMemo(() => {
    const source = activeList === 'mine' ? directory.mine : directory.discover;
    const query = search.trim().toLowerCase();
    return query
      ? source.filter((community) =>
          `${community.name} ${community.description} ${community.category}`.toLowerCase().includes(query)
        )
      : source;
  }, [activeList, directory, search]);

  const refreshSelected = async () => {
    if (!selectedId) return;
    await Promise.all([loadDirectory(), loadDetail(selectedId)]);
  };

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const { community } = await authApi.createCommunity(newCommunity);
      setNewCommunity({ name: '', description: '', category: 'General', privacy: 'public' });
      setCreateOpen(false);
      setActiveList('mine');
      setSelectedId(community.id);
      setNotice('Community created. You are its owner.');
      await loadDirectory();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : 'Could not create the community.');
    } finally {
      setSaving(false);
    }
  };

  const handleJoin = async (community: CommunitySummary) => {
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const result = await authApi.joinCommunity(community.id);
      if (result.status === 'requested') {
        setNotice('Join request sent. A community moderator must approve it.');
        return;
      }
      await loadDirectory();
      setActiveList('mine');
      setSelectedId(community.id);
      setNotice('You joined the community.');
    } catch (joinError) {
      setError(joinError instanceof Error ? joinError.message : 'Could not join this community.');
    } finally {
      setSaving(false);
    }
  };

  const handleLeave = async () => {
    if (!detail || saving) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      await authApi.leaveCommunity(detail.community.id);
      setSelectedId(null);
      setDetail(null);
      await loadDirectory();
      setNotice('You left the community.');
    } catch (leaveError) {
      setError(leaveError instanceof Error ? leaveError.message : 'Could not leave the community.');
    } finally {
      setSaving(false);
    }
  };

  const handleCreateGroup = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!detail || saving) return;
    setSaving(true);
    setError('');
    try {
      const { group } = await authApi.createCommunityGroup(detail.community.id, {
        name: groupName,
        description: groupDescription,
      });
      setGroupName('');
      setGroupDescription('');
      await refreshSelected();
      onOpenGroup(group);
    } catch (groupError) {
      setError(groupError instanceof Error ? groupError.message : 'Could not create this subgroup.');
    } finally {
      setSaving(false);
    }
  };

  const handlePublishAnnouncement = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!detail || saving) return;
    setSaving(true);
    setError('');
    try {
      await authApi.publishCommunityAnnouncement(detail.community.id, announcementBody);
      setAnnouncementBody('');
      await loadDetail(detail.community.id);
      setNotice('Announcement published.');
    } catch (announcementError) {
      setError(announcementError instanceof Error ? announcementError.message : 'Could not publish the announcement.');
    } finally {
      setSaving(false);
    }
  };

  const handleReviewRequest = async (phone: string, action: 'approve' | 'reject') => {
    if (!detail || saving) return;
    setSaving(true);
    setError('');
    try {
      await authApi.reviewCommunityJoinRequest(detail.community.id, phone, action);
      await refreshSelected();
    } catch (reviewError) {
      setError(reviewError instanceof Error ? reviewError.message : 'Could not review the join request.');
    } finally {
      setSaving(false);
    }
  };

  const handleCreateInvite = async () => {
    if (!detail || saving) return;
    setSaving(true);
    setError('');
    try {
      const invite = await authApi.createCommunityInvite(detail.community.id);
      setInviteUrl(`${window.location.origin}/?communityInvite=${encodeURIComponent(invite.token)}`);
      setNotice(`Invitation link created. It expires ${new Date(invite.expiresAt).toLocaleString()}.`);
    } catch (inviteError) {
      setError(inviteError instanceof Error ? inviteError.message : 'Could not create an invitation link.');
    } finally {
      setSaving(false);
    }
  };

  const handleAcceptInvite = async () => {
    if (!inviteToken || saving) return;
    setSaving(true);
    setError('');
    try {
      const { communityId } = await authApi.acceptCommunityInvite(inviteToken);
      const state = window.history.state;
      window.history.replaceState(state, '', window.location.pathname);
      setInvitePreview(null);
      setSelectedId(communityId);
      await loadDirectory();
      setNotice('Invitation accepted. You joined the community.');
    } catch (acceptError) {
      setError(acceptError instanceof Error ? acceptError.message : 'Could not accept this invitation.');
    } finally {
      setSaving(false);
    }
  };

  const handleRequestInvite = async () => {
    if (!inviteToken || saving) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const { status } = await authApi.requestCommunityInvite(inviteToken);
      setInviteRequested(true);
      setNotice(status === 'already_joined'
        ? 'You are already a member of this community.'
        : 'Your request was sent to the community administrators.');
      if (status === 'joined') {
        const state = window.history.state;
        window.history.replaceState(state, '', window.location.pathname);
        setInvitePreview(null);
        await loadDirectory();
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Could not request to join this community.');
    } finally {
      setSaving(false);
    }
  };

  const handleCopyInvite = async () => {
    if (!inviteUrl) return;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setNotice('Invitation link copied.');
    } catch {
      setError('Could not copy the link automatically. Select and copy the link below.');
    }
  };

  const canManage = Boolean(detail?.community.currentRole &&
    ['owner', 'admin', 'moderator'].includes(detail.community.currentRole));

  return (
    <section className={`flex h-full min-w-0 flex-1 flex-col overflow-hidden ${panelClass}`} aria-label="Communities">
      {!selectedId ? (
        <div className="flex min-w-0 flex-1 flex-col">
          <header className={`border-b p-4 ${isDark ? 'border-white/10' : 'border-slate-200'}`}>
            <div className="flex items-center justify-between gap-3">
              <div>
                <h1 className="flex items-center gap-2 text-xl font-bold"><UsersRound className="h-5 w-5 text-emerald-500" />Communities</h1>
                <p className={`mt-1 text-sm ${mutedClass}`}>Find people and conversations around shared interests.</p>
              </div>
              <button
                type="button"
                onClick={() => { setCreateOpen((open) => !open); setError(''); }}
                className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-lg bg-emerald-600 px-3 text-sm font-semibold text-white hover:bg-emerald-500"
              >
                <Plus className="h-4 w-4" />Create
              </button>
            </div>
            <div className="mt-4 flex gap-2">
              <button type="button" onClick={() => setActiveList('mine')} className={`min-h-10 rounded-full px-4 text-sm ${activeList === 'mine' ? 'bg-emerald-600 text-white' : 'bg-white/10'}`}>My communities ({directory.mine.length})</button>
              <button type="button" onClick={() => setActiveList('discover')} className={`min-h-10 rounded-full px-4 text-sm ${activeList === 'discover' ? 'bg-emerald-600 text-white' : 'bg-white/10'}`}>Explore ({directory.discover.length})</button>
            </div>
            <label className="relative mt-3 block">
              <Search className={`absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 ${mutedClass}`} />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search communities" className={`${fieldClass} pl-9`} />
            </label>
          </header>

          {error && <div role="alert" className="mx-4 mt-4 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-300">{error}</div>}
          {notice && <div role="status" className="mx-4 mt-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-300">{notice}</div>}

          {invitePreview && (
            <section className={`m-4 rounded-xl border p-4 ${isDark ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-emerald-200 bg-emerald-50'}`}>
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-500">Community invitation</p>
              <h2 className="mt-1 font-semibold">{invitePreview.community.name}</h2>
              <p className={`mt-1 text-sm ${mutedClass}`}>{invitePreview.community.description || 'You have been invited to join this community.'}</p>
              <p className={`mt-2 text-xs ${mutedClass}`}>{invitePreview.community.memberCount} members · Invitation expires {new Date(invitePreview.expiresAt).toLocaleDateString()}</p>
              {invitePreview.community.privacy === 'private' ? (
                <button type="button" disabled={saving || inviteRequested} onClick={() => void handleRequestInvite()} className="mt-3 min-h-10 rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white disabled:opacity-50">
                  {saving ? 'Sending…' : inviteRequested ? 'Request sent' : 'Request to join'}
                </button>
              ) : (
                <button type="button" disabled={saving} onClick={() => void handleAcceptInvite()} className="mt-3 min-h-10 rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white disabled:opacity-50">{saving ? 'Joining…' : 'Accept invitation'}</button>
              )}
            </section>
          )}

          {createOpen && (
            <form onSubmit={handleCreate} className={`m-4 grid gap-3 rounded-xl border p-4 sm:grid-cols-2 ${isDark ? 'border-white/10 bg-white/[0.03]' : 'border-slate-200 bg-slate-50'}`}>
              <h2 className="font-semibold sm:col-span-2">Create a community</h2>
              <input required minLength={2} maxLength={80} value={newCommunity.name} onChange={(event) => setNewCommunity((form) => ({ ...form, name: event.target.value }))} placeholder="Community name" className={fieldClass} />
              <input maxLength={60} value={newCommunity.category} onChange={(event) => setNewCommunity((form) => ({ ...form, category: event.target.value }))} placeholder="Category" className={fieldClass} />
              <textarea maxLength={1000} value={newCommunity.description} onChange={(event) => setNewCommunity((form) => ({ ...form, description: event.target.value }))} placeholder="Description and purpose" className={`${fieldClass} min-h-20 sm:col-span-2`} />
              <select value={newCommunity.privacy} onChange={(event) => setNewCommunity((form) => ({ ...form, privacy: event.target.value as 'public' | 'private' }))} className={fieldClass}>
                <option value="public">Public — discoverable and open to join</option>
                <option value="private">Private — membership by approval</option>
              </select>
              <div className="flex justify-end gap-2 sm:col-span-2">
                <button type="button" onClick={() => setCreateOpen(false)} className="min-h-10 rounded-lg bg-white/10 px-4 text-sm">Cancel</button>
                <button disabled={saving} className="min-h-10 rounded-lg bg-emerald-600 px-4 text-sm font-semibold text-white disabled:opacity-50">{saving ? 'Creating…' : 'Create community'}</button>
              </div>
            </form>
          )}

          <div className="flex-1 overflow-y-auto p-4">
            {loading ? (
              <div className="flex justify-center p-10"><Loader2 className="h-6 w-6 animate-spin text-emerald-500" /></div>
            ) : visibleCommunities.length === 0 ? (
              <div className={`rounded-xl border p-8 text-center ${isDark ? 'border-white/10' : 'border-slate-200'}`}>
                <UsersRound className={`mx-auto h-8 w-8 ${mutedClass}`} />
                <p className="mt-3 font-semibold">{activeList === 'mine' ? 'No communities yet' : 'No public communities found'}</p>
                <p className={`mt-1 text-sm ${mutedClass}`}>{activeList === 'mine' ? 'Create one or explore public communities to join.' : 'Try another search, or create a community of your own.'}</p>
              </div>
            ) : (
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {visibleCommunities.map((community) => (
                  <article key={community.id} className={`rounded-xl border p-4 ${isDark ? 'border-white/10 bg-white/[0.03]' : 'border-slate-200 bg-white'}`}>
                    <button type="button" onClick={() => setSelectedId(community.id)} className="block w-full text-left">
                      <div className="flex items-start gap-3">
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-emerald-600/15 text-emerald-500">
                          {community.imageUrl ? <img src={community.imageUrl} alt="" className="h-full w-full object-cover" /> : <UsersRound className="h-6 w-6" />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <h2 className="truncate font-semibold">{community.name}</h2>
                          <p className={`mt-1 text-xs ${mutedClass}`}>{community.category} · {community.privacy === 'private' ? 'Private' : 'Public'}</p>
                        </div>
                      </div>
                      <p className={`mt-3 line-clamp-2 min-h-10 text-sm ${mutedClass}`}>{community.description || 'No description provided.'}</p>
                      <p className={`mt-3 text-xs ${mutedClass}`}>{community.memberCount} members · {community.groupCount} subgroups</p>
                    </button>
                    {activeList === 'discover' && (
                      <button type="button" disabled={saving} onClick={() => void handleJoin(community)} className="mt-3 min-h-10 w-full rounded-lg bg-emerald-600 px-3 text-sm font-semibold text-white disabled:opacity-50">
                        {saving ? 'Please wait…' : community.privacy === 'private' ? 'Request to join' : 'Join community'}
                      </button>
                    )}
                  </article>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : detailLoading ? (
        <div className="flex flex-1 items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-emerald-500" /></div>
      ) : detail ? (
        <div className="flex min-w-0 flex-1 flex-col overflow-y-auto">
          <header className={`sticky top-0 z-10 flex items-center gap-3 border-b p-4 ${panelClass} ${isDark ? 'border-white/10' : 'border-slate-200'}`}>
            <button type="button" onClick={() => { setSelectedId(null); setDetail(null); setError(''); }} aria-label="Back to communities" className="min-h-10 min-w-10 rounded-lg bg-white/10 p-2"><ArrowLeft className="h-5 w-5" /></button>
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-emerald-600/15 text-emerald-500">
                {detail.community.imageUrl ? <img src={detail.community.imageUrl} alt="" className="h-full w-full object-cover" /> : <UsersRound className="h-6 w-6" />}
              </div>
              <div className="min-w-0">
                <h1 className="truncate text-lg font-bold">{detail.community.name}</h1>
                <p className={`text-xs ${mutedClass}`}>{detail.community.memberCount} members · {detail.community.category}</p>
              </div>
            </div>
            {detail.community.currentRole && detail.community.currentRole !== 'owner' && (
              <button type="button" disabled={saving} onClick={() => void handleLeave()} className="min-h-10 rounded-lg border border-white/10 px-3 text-xs font-semibold disabled:opacity-50">Leave</button>
            )}
          </header>

          {error && <div role="alert" className="mx-4 mt-4 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-300">{error}</div>}
          {notice && <div role="status" className="mx-4 mt-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-300">{notice}</div>}

          <div className="mx-auto w-full max-w-4xl space-y-6 p-4 sm:p-6">
            <section className={`rounded-xl border p-4 ${isDark ? 'border-white/10 bg-white/[0.03]' : 'border-slate-200 bg-slate-50'}`}>
              <div className="flex items-center gap-2 text-sm font-semibold">
                {detail.community.privacy === 'private' ? <LockKeyhole className="h-4 w-4 text-amber-400" /> : <Globe2 className="h-4 w-4 text-emerald-500" />}
                {detail.community.privacy === 'private' ? 'Private community' : 'Public community'}
                {detail.community.currentRole && <span className={`ml-auto rounded-full bg-emerald-600/15 px-2 py-1 text-xs text-emerald-500`}>{detail.community.currentRole}</span>}
              </div>
              <p className={`mt-3 whitespace-pre-wrap text-sm ${mutedClass}`}>{detail.community.description || 'No description provided.'}</p>
            </section>

            {canManage && (
              <section className={`rounded-xl border p-4 ${isDark ? 'border-white/10' : 'border-slate-200'}`}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="font-semibold">Invite members</h2>
                    <p className={`mt-1 text-xs ${mutedClass}`}>Create a private link that expires after seven days.</p>
                  </div>
                  <button type="button" disabled={saving} onClick={() => void handleCreateInvite()} className="min-h-10 rounded-lg bg-emerald-600 px-3 text-sm font-semibold text-white disabled:opacity-50">Create invite link</button>
                </div>
                {inviteUrl && (
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                    <input readOnly value={inviteUrl} onFocus={(event) => event.currentTarget.select()} aria-label="Community invite link" className={fieldClass} />
                    <button type="button" onClick={() => void handleCopyInvite()} className="min-h-10 shrink-0 rounded-lg bg-white/10 px-4 text-sm font-semibold">Copy link</button>
                  </div>
                )}
              </section>
            )}

            <section>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="flex items-center gap-2 font-semibold"><MessageSquare className="h-4 w-4 text-emerald-500" />Subgroups</h2>
                <span className={`text-xs ${mutedClass}`}>{detail.groups.length}</span>
              </div>
              <div className="space-y-2">
                {detail.groups.map((group) => (
                  <button key={group.conversation.id} type="button" onClick={() => onOpenGroup(group.conversation)} className={`flex min-h-14 w-full items-center gap-3 rounded-xl border p-3 text-left ${isDark ? 'border-white/10 hover:bg-white/5' : 'border-slate-200 hover:bg-slate-50'}`}>
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-600/15 text-emerald-500"><MessageSquare className="h-4 w-4" /></div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{group.conversation.name}</p>
                      <p className={`truncate text-xs ${mutedClass}`}>{group.conversation.memberPhones.length} members{group.conversation.description ? ` · ${group.conversation.description}` : ''}</p>
                    </div>
                  </button>
                ))}
                {detail.groups.length === 0 && <p className={`rounded-xl border border-dashed p-4 text-sm ${mutedClass}`}>No subgroups yet.</p>}
              </div>
              {canManage && (
                <form onSubmit={handleCreateGroup} className={`mt-3 grid gap-2 rounded-xl border p-3 sm:grid-cols-[1fr_1.5fr_auto] ${isDark ? 'border-white/10' : 'border-slate-200'}`}>
                  <input required minLength={2} maxLength={80} value={groupName} onChange={(event) => setGroupName(event.target.value)} placeholder="New subgroup name" className={fieldClass} />
                  <input maxLength={500} value={groupDescription} onChange={(event) => setGroupDescription(event.target.value)} placeholder="Description (optional)" className={fieldClass} />
                  <button disabled={saving} className="min-h-10 rounded-lg bg-emerald-600 px-3 text-sm font-semibold text-white disabled:opacity-50"><Plus className="mr-1 inline h-4 w-4" />Add group</button>
                </form>
              )}
            </section>

            <section>
              <div className="mb-3 flex items-center gap-2">
                <Megaphone className="h-4 w-4 text-amber-400" />
                <h2 className="font-semibold">Announcements</h2>
                <span className={`ml-auto text-xs ${mutedClass}`}>{detail.announcements.length}</span>
              </div>
              {canManage && (
                <form onSubmit={handlePublishAnnouncement} className="mb-3 rounded-xl border border-amber-400/20 p-3">
                  <textarea required maxLength={3000} value={announcementBody} onChange={(event) => setAnnouncementBody(event.target.value)} placeholder="Share an announcement with community members" className={`${fieldClass} min-h-24`} />
                  <div className="mt-2 flex justify-end">
                    <button disabled={saving} className="min-h-10 rounded-lg bg-amber-500 px-4 text-sm font-semibold text-black disabled:opacity-50"><Send className="mr-2 inline h-4 w-4" />Publish</button>
                  </div>
                </form>
              )}
              <div className="space-y-2">
                {detail.announcements.map((announcement) => (
                  <article key={announcement.id} className={`rounded-xl border p-4 ${isDark ? 'border-white/10 bg-white/[0.03]' : 'border-slate-200'}`}>
                    <div className="flex items-center gap-2 text-xs">
                      <ShieldCheck className="h-4 w-4 text-amber-400" />
                      <span className="font-semibold">{announcement.authorName}</span>
                      <time className={`ml-auto ${mutedClass}`} dateTime={announcement.createdAt}>{new Date(announcement.createdAt).toLocaleString()}</time>
                    </div>
                    <p className="mt-3 whitespace-pre-wrap text-sm">{announcement.body}</p>
                  </article>
                ))}
                {detail.announcements.length === 0 && <p className={`rounded-xl border border-dashed p-4 text-sm ${mutedClass}`}>No announcements yet.</p>}
              </div>
            </section>

            <section>
              <h2 className="mb-3 flex items-center gap-2 font-semibold"><UsersRound className="h-4 w-4 text-emerald-500" />Members ({detail.members.length})</h2>
              <div className="grid gap-2 sm:grid-cols-2">
                {detail.members.map((member) => (
                  <div key={member.phone} className={`flex min-w-0 items-center gap-3 rounded-lg border p-3 ${isDark ? 'border-white/10' : 'border-slate-200'}`}>
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-emerald-600/15 text-sm font-semibold text-emerald-500">
                      {member.avatarUrl ? <img src={member.avatarUrl} alt="" className="h-full w-full object-cover" /> : member.name.slice(0, 1).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{member.name}</p>
                      <p className={`text-xs capitalize ${mutedClass}`}>{member.role}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {canManage && detail.pendingJoinRequests.length > 0 && (
              <section>
                <h2 className="mb-3 font-semibold">Join requests ({detail.pendingJoinRequests.length})</h2>
                <div className="space-y-2">
                  {detail.pendingJoinRequests.map((request) => (
                    <div key={request.phone} className={`flex items-center gap-3 rounded-lg border p-3 ${isDark ? 'border-white/10' : 'border-slate-200'}`}>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{request.name}</p>
                        <p className={`text-xs ${mutedClass}`}>{request.phone}</p>
                      </div>
                      <button type="button" disabled={saving} onClick={() => void handleReviewRequest(request.phone, 'approve')} aria-label={`Approve ${request.name}`} className="min-h-10 min-w-10 rounded-lg bg-emerald-600 p-2 text-white disabled:opacity-50"><Check className="h-4 w-4" /></button>
                      <button type="button" disabled={saving} onClick={() => void handleReviewRequest(request.phone, 'reject')} aria-label={`Reject ${request.name}`} className="min-h-10 min-w-10 rounded-lg bg-rose-600/80 p-2 text-white disabled:opacity-50"><X className="h-4 w-4" /></button>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
          <p className="text-sm text-rose-300">{error || 'Community could not be opened.'}</p>
          <button type="button" onClick={() => setSelectedId(null)} className="min-h-10 rounded-lg bg-white/10 px-4 text-sm">Back to communities</button>
        </div>
      )}
      <nav className={`grid shrink-0 grid-cols-5 border-t pb-[env(safe-area-inset-bottom)] md:hidden ${isDark ? 'border-white/10 bg-[#202c33]' : 'border-slate-200 bg-slate-50'}`} aria-label="Main navigation">
        {([
          ['chats', MessageSquare, 'Chats'],
          ['status', CircleDashed, 'Updates'],
          ['communities', UsersRound, 'Communities'],
          ['calls', Phone, 'Calls'],
          ['settings', Settings, 'Settings'],
        ] as const).map(([tab, Icon, label]) => (
          <button
            key={tab}
            type="button"
            onClick={() => onNavigateTab(tab)}
            aria-current={activeTab === tab ? 'page' : undefined}
            className={`flex min-h-14 flex-col items-center justify-center gap-1 text-[10px] ${
              activeTab === tab ? 'text-emerald-500' : mutedClass
            }`}
          >
            <Icon className="h-5 w-5" />
            {label}
          </button>
        ))}
      </nav>
    </section>
  );
};
