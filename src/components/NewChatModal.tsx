import React, { useState, useEffect } from 'react';
import { Contact } from '../types/chat';
import type { ContactLookupResponse, ZoloPeerProfile } from '../types/auth';
import {
  COUNTRY_DIAL_OPTIONS,
  CountryCodeSelect,
  type CountryDialOption,
} from './CountryCodeSelect';
import { UserAvatar } from './UserAvatar';
import { authApi, AuthApiClientError } from '../utils/authApi';
import {
  X,
  Search,
  UserPlus,
  Users,
  MessageSquare,
  CheckCircle2,
  Loader2,
  AlertCircle,
  Sparkles,
} from 'lucide-react';

interface NewChatModalProps {
  contacts: Contact[];
  theme: 'dark' | 'light';
  onClose: () => void;
  onSelectContact: (contactId: string) => void;
  onOpenNewGroup: () => void;
  onAddNewContact: (
    name: string,
    phoneNormalized: string,
    about: string,
    avatar: string,
    isRegisteredZoloUser: boolean,
    online: boolean,
    lastSeen: string
  ) => void;
}

export const NewChatModal: React.FC<NewChatModalProps> = ({
  contacts,
  theme,
  onClose,
  onSelectContact,
  onOpenNewGroup,
  onAddNewContact,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [directoryResults, setDirectoryResults] = useState<ZoloPeerProfile[]>([]);
  const [searchingDirectory, setSearchingDirectory] = useState(false);

  const [isAddingCustom, setIsAddingCustom] = useState(false);
  const [country, setCountry] = useState<CountryDialOption>(COUNTRY_DIAL_OPTIONS[0]); // Default India +91
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newAbout, setNewAbout] = useState('Hey there! I am using ZOLO.');

  const [lookupResult, setLookupResult] = useState<ContactLookupResponse | null>(null);
  const [lookingUp, setLookingUp] = useState(false);
  const [savingContact, setSavingContact] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const isDark = theme === 'dark';

  // Live ZOLO directory search when user types a name or mobile number in search bar
  useEffect(() => {
    const q = searchTerm.trim();
    if (q.length < 2) {
      setDirectoryResults([]);
      setSearchingDirectory(false);
      return;
    }

    let cancelled = false;
    setSearchingDirectory(true);
    const timer = window.setTimeout(() => {
      authApi
        .searchZoloDirectory(q)
        .then((res) => {
          if (!cancelled) {
            setDirectoryResults(res.users || []);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setDirectoryResults([]);
          }
        })
        .finally(() => {
          if (!cancelled) {
            setSearchingDirectory(false);
          }
        });
    }, 280);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [searchTerm]);

  // Live ZOLO user check as mobile number is entered in "Add New Contact"
  useEffect(() => {
    if (!isAddingCustom) return;
    const rawDigits = newPhone.replace(/\D/g, '');
    if (rawDigits.length < 6) {
      setLookupResult(null);
      setLookingUp(false);
      return;
    }

    let cancelled = false;
    setLookingUp(true);
    const timer = window.setTimeout(() => {
      authApi
        .lookupContactByPhone({
          phone: newPhone.trim(),
          countryIso: country.iso,
          dialCode: country.dialCode,
        })
        .then((res) => {
          if (cancelled) return;
          setLookupResult(res);
          if (res.isRegistered && res.user) {
            setNewAbout((prev) =>
              prev === 'Hey there! I am using ZOLO.' && res.user?.about
                ? res.user.about
                : prev
            );
          }
        })
        .catch(() => {
          if (!cancelled) {
            setLookupResult(null);
          }
        })
        .finally(() => {
          if (!cancelled) {
            setLookingUp(false);
          }
        });
    }, 320);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [isAddingCustom, newPhone, country.iso, country.dialCode]);

  const filteredContacts = contacts.filter((c) => {
    const q = searchTerm.toLowerCase().trim();
    if (!q) return true;
    const qDigits = q.replace(/\D/g, '');
    return (
      c.name.toLowerCase().includes(q) ||
      c.phone.toLowerCase().includes(q) ||
      (c.phoneNormalized && c.phoneNormalized.toLowerCase().includes(q)) ||
      (qDigits.length >= 3 &&
        (c.phone.replace(/\D/g, '').includes(qDigits) ||
          (c.phoneNormalized || '').replace(/\D/g, '').includes(qDigits)))
    );
  });

  // Directory users not already present in saved contacts
  const unsavedDirectoryUsers = directoryResults.filter(
    (u) =>
      !contacts.some(
        (c) =>
          c.phoneNormalized === u.phoneNormalized ||
          c.phone.replace(/\s+/g, '') === u.phoneNormalized
      )
  );

  const handleStartChatWithDirectoryUser = (peer: ZoloPeerProfile) => {
    const existing = contacts.find(
      (c) =>
        c.phoneNormalized === peer.phoneNormalized ||
        c.phone.replace(/\s+/g, '') === peer.phoneNormalized
    );
    if (existing) {
      onSelectContact(existing.id);
      onClose();
      return;
    }

    onAddNewContact(
      peer.fullName,
      peer.phoneNormalized,
      peer.about || 'Hey there! I am using ZOLO.',
      peer.avatarUrl || '',
      true,
      Boolean(peer.online),
      peer.lastSeen || 'recently on ZOLO'
    );
    onClose();
  };

  const handleCreateNewContact = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!newPhone.trim()) {
      setFormError('Please enter a valid mobile number.');
      return;
    }

    setSavingContact(true);
    try {
      const checked = await authApi.lookupContactByPhone({
        phone: newPhone.trim(),
        countryIso: country.iso,
        dialCode: country.dialCode,
      });

      const resolvedName =
        newName.trim() ||
        checked.user?.fullName ||
        checked.phoneNormalized;
      const resolvedAbout =
        newAbout.trim() ||
        checked.user?.about ||
        'Hey there! I am using ZOLO.';
      const resolvedAvatar = checked.user?.avatarUrl || '';

      onAddNewContact(
        resolvedName,
        checked.phoneNormalized,
        resolvedAbout,
        resolvedAvatar,
        checked.isRegistered,
        checked.online,
        checked.lastSeen
      );
      setIsAddingCustom(false);
      onClose();
    } catch (err) {
      if (err instanceof AuthApiClientError) {
        setFormError(err.message);
      } else {
        setFormError('Could not validate this mobile number. Check the country code and digits.');
      }
    } finally {
      setSavingContact(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div
        className={`relative w-full max-w-md rounded-2xl overflow-hidden shadow-2xl flex flex-col h-[590px] border ${
          isDark
            ? 'bg-[#111b21] border-slate-800 text-white'
            : 'bg-white border-slate-200 text-slate-900'
        }`}
      >
        {/* Header */}
        <div
          className={`flex items-center justify-between p-4 border-b ${
            isDark ? 'bg-[#202c33] border-slate-700' : 'bg-[#008069] text-white border-emerald-700'
          }`}
        >
          <div className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-[#00a884] dark:text-[#00a884]" />
            <h3 className="font-semibold text-base">
              {isAddingCustom ? 'Save ZOLO Contact' : 'New Chat'}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-full hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        {isAddingCustom ? (
          <form onSubmit={handleCreateNewContact} className="p-5 flex flex-col gap-4 flex-1 overflow-y-auto">
            {formError && (
              <div className="flex items-start gap-2 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{formError}</span>
              </div>
            )}

            <div>
              <label className="text-xs font-semibold text-slate-400 block mb-1.5">
                Mobile Number <span className="text-rose-400">*</span>
              </label>
              <div className="flex items-center gap-2">
                <CountryCodeSelect
                  id="new-contact-country"
                  selectedIso={country.iso}
                  onSelect={(opt) => {
                    setFormError(null);
                    setCountry(opt);
                  }}
                  isDark={isDark}
                />
                <input
                  type="tel"
                  inputMode="tel"
                  required
                  value={newPhone}
                  onChange={(e) => {
                    setFormError(null);
                    setNewPhone(e.target.value);
                  }}
                  placeholder={country.placeholder}
                  className={`flex-1 h-11 px-3.5 rounded-xl text-sm tabular-nums outline-none border ${
                    isDark
                      ? 'bg-[#202c33] border-slate-700 text-white placeholder-slate-500'
                      : 'bg-slate-50 border-slate-300 text-slate-900 placeholder-slate-400'
                  } focus:border-[#00a884]`}
                  autoFocus
                />
              </div>
            </div>

            {/* Live ZOLO Account Detection Card */}
            {lookingUp && (
              <div
                className={`flex items-center gap-2.5 p-3 rounded-xl border text-xs ${
                  isDark
                    ? 'bg-[#202c33]/70 border-slate-700 text-slate-300'
                    : 'bg-slate-50 border-slate-200 text-slate-600'
                }`}
              >
                <Loader2 className="w-4 h-4 animate-spin text-[#00a884] shrink-0" />
                <span>Checking if this mobile number is on ZOLO...</span>
              </div>
            )}

            {!lookingUp && lookupResult && (
              <div
                className={`p-3 rounded-xl border text-xs transition-all ${
                  lookupResult.isRegistered
                    ? isDark
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200'
                      : 'bg-emerald-50 border-emerald-200 text-emerald-900'
                    : isDark
                    ? 'bg-[#202c33]/70 border-slate-700 text-slate-300'
                    : 'bg-slate-50 border-slate-200 text-slate-700'
                }`}
              >
                {lookupResult.isRegistered && lookupResult.user ? (
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <UserAvatar
                        src={lookupResult.user.avatarUrl}
                        name={lookupResult.user.fullName}
                        className="w-9 h-9 shrink-0"
                        textClassName="text-xs"
                      />
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 font-semibold truncate">
                          <CheckCircle2 className="w-3.5 h-3.5 text-[#00a884] shrink-0" />
                          <span className="truncate">{lookupResult.user.fullName} is on ZOLO</span>
                        </div>
                        <div className="text-[11px] opacity-80 truncate">
                          {lookupResult.phoneNormalized} • {lookupResult.online ? 'online now' : lookupResult.lastSeen}
                        </div>
                      </div>
                    </div>
                    {!newName.trim() && (
                      <button
                        type="button"
                        onClick={() => setNewName(lookupResult.user?.fullName || '')}
                        className="px-2.5 py-1 rounded-lg bg-[#00a884] text-white font-semibold text-[11px] shrink-0 hover:bg-[#008f72]"
                      >
                        Use Name
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="flex items-start gap-2">
                    <Sparkles className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                    <div>
                      <div className="font-semibold">
                        {lookupResult.phoneNormalized} is not registered yet
                      </div>
                      <div className="text-[11px] opacity-80 mt-0.5">
                        You can save this number and send messages now — they will be delivered automatically as soon as they join ZOLO with this number.
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div>
              <label className="text-xs font-semibold text-slate-400 block mb-1.5">
                Contact Name {lookupResult?.user ? '(Optional — defaults to ZOLO name)' : '*'}
              </label>
              <input
                type="text"
                required={!lookupResult?.user}
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder={lookupResult?.user?.fullName || 'e.g. Rahul Verma'}
                className={`w-full px-3.5 py-2.5 rounded-xl text-sm outline-none border ${
                  isDark ? 'bg-[#202c33] border-slate-700 text-white' : 'bg-slate-50 border-slate-300'
                } focus:border-[#00a884]`}
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-400 block mb-1.5">About / Note</label>
              <input
                type="text"
                value={newAbout}
                onChange={(e) => setNewAbout(e.target.value)}
                className={`w-full px-3.5 py-2.5 rounded-xl text-sm outline-none border ${
                  isDark ? 'bg-[#202c33] border-slate-700 text-white' : 'bg-slate-50 border-slate-300'
                } focus:border-[#00a884]`}
              />
            </div>

            <div className="mt-auto flex items-center justify-end gap-3 pt-4 border-t border-slate-700/50">
              <button
                type="button"
                onClick={() => {
                  setIsAddingCustom(false);
                  setFormError(null);
                }}
                className="px-4 py-2 text-xs font-medium rounded-lg text-slate-400 hover:text-white"
              >
                Back
              </button>
              <button
                type="submit"
                disabled={savingContact || !newPhone.trim()}
                className="inline-flex items-center gap-2 px-5 py-2.5 text-xs font-semibold rounded-xl bg-[#00a884] hover:bg-[#008f72] text-white shadow-md disabled:opacity-50"
              >
                {savingContact && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                <span>Save Contact &amp; Chat</span>
              </button>
            </div>
          </form>
        ) : (
          <div className="flex flex-col flex-1 overflow-hidden">
            {/* Search Bar */}
            <div className="p-3 border-b border-slate-700/40">
              <div
                className={`flex items-center gap-2 px-3 py-2 rounded-xl border ${
                  isDark
                    ? 'bg-[#202c33] border-slate-700/60 focus-within:border-[#00a884]'
                    : 'bg-slate-100 border-slate-200 focus-within:border-[#008069]'
                }`}
              >
                <Search className="w-4 h-4 text-slate-400 shrink-0" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search saved contacts or ZOLO mobile number (+91...)"
                  className="w-full bg-transparent text-sm outline-none placeholder-slate-400"
                />
                {searchingDirectory && (
                  <Loader2 className="w-4 h-4 animate-spin text-[#00a884] shrink-0" />
                )}
              </div>
            </div>

            {/* Quick Action Buttons */}
            <div className="p-2 border-b border-slate-700/30 flex flex-col gap-1">
              <button
                onClick={() => setIsAddingCustom(true)}
                className={`flex items-center gap-3 p-2.5 rounded-xl transition-colors text-left ${
                  isDark ? 'hover:bg-[#202c33]' : 'hover:bg-slate-100'
                }`}
              >
                <div className="w-10 h-10 rounded-full bg-[#00a884] flex items-center justify-center text-white shrink-0">
                  <UserPlus className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-sm font-semibold">New Contact (Mobile Number)</div>
                  <div className="text-xs text-slate-400">
                    Save a ZOLO user&apos;s mobile number &amp; message directly
                  </div>
                </div>
              </button>

              <button
                onClick={() => {
                  onClose();
                  onOpenNewGroup();
                }}
                className={`flex items-center gap-3 p-2.5 rounded-xl transition-colors text-left ${
                  isDark ? 'hover:bg-[#202c33]' : 'hover:bg-slate-100'
                }`}
              >
                <div className="w-10 h-10 rounded-full bg-emerald-700/70 flex items-center justify-center text-white shrink-0">
                  <Users className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-sm font-semibold">New Group</div>
                  <div className="text-xs text-slate-400">Create a group chat with contacts</div>
                </div>
              </button>
            </div>

            {/* Contacts & Live Directory Results */}
            <div className="flex-1 overflow-y-auto p-2 space-y-2">
              {unsavedDirectoryUsers.length > 0 && (
                <div>
                  <div className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-[#00a884]">
                    Registered ZOLO Users
                  </div>
                  {unsavedDirectoryUsers.map((peer) => (
                    <button
                      key={peer.uid}
                      onClick={() => handleStartChatWithDirectoryUser(peer)}
                      className={`w-full flex items-center gap-3 p-2.5 rounded-xl transition-colors text-left ${
                        isDark ? 'hover:bg-[#202c33]' : 'hover:bg-slate-100'
                      }`}
                    >
                      <div className="relative shrink-0">
                        <UserAvatar
                          src={peer.avatarUrl}
                          name={peer.fullName}
                          className="w-11 h-11"
                          textClassName="text-sm"
                        />
                        {peer.online && (
                          <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-emerald-500 border-2 border-[#111b21]" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm font-semibold truncate">{peer.fullName}</span>
                          <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-[#00a884]/20 text-[#00a884] rounded">
                            ZOLO
                          </span>
                        </div>
                        <div className="text-xs text-slate-400 truncate">
                          {peer.phoneNormalized} • {peer.about}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              <div>
                <div className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Saved Contacts
                </div>
                {filteredContacts.map((contact) => (
                  <button
                    key={contact.id}
                    onClick={() => {
                      onSelectContact(contact.id);
                      onClose();
                    }}
                    className={`w-full flex items-center gap-3 p-2.5 rounded-xl transition-colors text-left ${
                      isDark ? 'hover:bg-[#202c33]' : 'hover:bg-slate-100'
                    }`}
                  >
                    <div className="relative w-11 h-11 rounded-full overflow-hidden bg-slate-700 shrink-0">
                      <UserAvatar
                        src={contact.avatar}
                        name={contact.name}
                        className="w-11 h-11"
                        textClassName="text-sm"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-semibold truncate">{contact.name}</span>
                        {contact.isRegisteredZoloUser && (
                          <span className="px-1.5 py-0.5 text-[10px] font-semibold bg-[#00a884]/20 text-[#00a884] rounded shrink-0">
                            ZOLO
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-400 truncate">
                        {contact.phoneNormalized ? `${contact.phoneNormalized} • ` : ''}
                        {contact.about}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
