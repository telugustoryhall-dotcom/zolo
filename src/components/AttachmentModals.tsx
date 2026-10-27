import React, { useState } from 'react';
import { X, Send, MapPin, Plus, Trash2, FileText, CheckCircle2 } from 'lucide-react';
import { LocationData, PollData } from '../types/chat';

interface ImagePreviewModalProps {
  imageUrl: string;
  theme: 'dark' | 'light';
  onClose: () => void;
  onSend: (caption: string) => void;
}

export const ImagePreviewModal: React.FC<ImagePreviewModalProps> = ({
  imageUrl,
  theme,
  onClose,
  onSend,
}) => {
  const [caption, setCaption] = useState('');
  const isDark = theme === 'dark';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4">
      <div
        className={`relative w-full max-w-xl rounded-2xl overflow-hidden shadow-2xl flex flex-col h-[540px] border ${
          isDark ? 'bg-[#111b21] border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-900'
        }`}
      >
        <div className="flex items-center justify-between p-3 border-b border-slate-700/40">
          <span className="text-sm font-semibold">Send Photo</span>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-white/10">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 bg-black flex items-center justify-center p-4 overflow-hidden">
          <img src={imageUrl} alt="Attachment" className="max-h-[360px] max-w-full object-contain rounded-lg" />
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSend(caption.trim());
          }}
          className="p-4 flex items-center gap-2 border-t border-slate-700/40"
        >
          <input
            type="text"
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder="Add a caption..."
            className={`flex-1 px-4 py-2.5 rounded-full text-sm outline-none border ${
              isDark ? 'bg-[#202c33] border-slate-700 text-white' : 'bg-slate-100 border-slate-200'
            } focus:border-[#00a884]`}
            autoFocus
          />
          <button
            type="submit"
            className="w-10 h-10 rounded-full bg-[#00a884] text-white flex items-center justify-center hover:bg-[#008f72] shadow-md shrink-0"
          >
            <Send className="w-4 h-4 ml-0.5" />
          </button>
        </form>
      </div>
    </div>
  );
};

interface LocationPickerModalProps {
  theme: 'dark' | 'light';
  onClose: () => void;
  onSendLocation: (loc: LocationData) => void;
}

export const LocationPickerModal: React.FC<LocationPickerModalProps> = ({
  theme,
  onClose,
  onSendLocation,
}) => {
  const isDark = theme === 'dark';

  const PRESET_PLACES: LocationData[] = [
    {
      name: 'Yerba Buena Gardens',
      address: '750 Howard St, San Francisco, CA',
      lat: 37.7854,
      lng: -122.4022,
    },
    {
      name: 'Sightglass Coffee',
      address: '270 7th St, San Francisco, CA',
      lat: 37.7773,
      lng: -122.4087,
    },
    {
      name: 'Ferry Building Marketplace',
      address: '1 Ferry Building, San Francisco, CA',
      lat: 37.7955,
      lng: -122.3937,
    },
    {
      name: 'Current Live GPS Location',
      address: 'Approximate accuracy 15 meters',
      lat: 37.7749,
      lng: -122.4194,
    },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
      <div
        className={`relative w-full max-w-md rounded-2xl overflow-hidden shadow-2xl flex flex-col h-[520px] border ${
          isDark ? 'bg-[#111b21] border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-900'
        }`}
      >
        <div className="flex items-center justify-between p-4 border-b border-slate-700/40">
          <div className="flex items-center gap-2">
            <MapPin className="w-5 h-5 text-[#00a884]" />
            <h3 className="font-semibold text-base">Share Location</h3>
          </div>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-white/10">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Map stylized preview */}
        <div className="h-44 bg-slate-900 relative overflow-hidden flex items-center justify-center border-b border-slate-700/40">
          <div className="absolute inset-0 opacity-40 bg-[radial-gradient(#00a884_1px,transparent_1px)] [background-size:16px_16px]" />
          <div className="relative flex flex-col items-center">
            <div className="w-12 h-12 rounded-full bg-[#00a884]/20 flex items-center justify-center animate-ping absolute" />
            <div className="w-10 h-10 rounded-full bg-[#00a884] text-white flex items-center justify-center shadow-lg relative z-10">
              <MapPin className="w-6 h-6" />
            </div>
            <span className="text-[11px] font-semibold text-emerald-400 mt-2 bg-black/60 px-2 py-0.5 rounded-full">
              GPS Active
            </span>
          </div>
        </div>

        {/* Places List */}
        <div className="flex-1 overflow-y-auto p-3">
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-400 px-2 mb-2">
            Nearby Places
          </div>

          <div className="flex flex-col gap-1">
            {PRESET_PLACES.map((place, idx) => (
              <button
                key={idx}
                onClick={() => {
                  onSendLocation(place);
                  onClose();
                }}
                className={`w-full flex items-start gap-3 p-3 rounded-xl text-left transition-colors ${
                  isDark ? 'hover:bg-[#202c33]' : 'hover:bg-slate-100'
                }`}
              >
                <div className="w-8 h-8 rounded-full bg-emerald-600/20 text-[#00a884] flex items-center justify-center shrink-0 mt-0.5">
                  <MapPin className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold truncate">{place.name}</div>
                  <div className="text-xs text-slate-400 truncate">{place.address}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

interface CreatePollModalProps {
  theme: 'dark' | 'light';
  onClose: () => void;
  onSendPoll: (poll: PollData) => void;
}

export const CreatePollModal: React.FC<CreatePollModalProps> = ({
  theme,
  onClose,
  onSendPoll,
}) => {
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [allowMultiple, setAllowMultiple] = useState(false);
  const isDark = theme === 'dark';

  const handleOptionChange = (idx: number, val: string) => {
    const updated = [...options];
    updated[idx] = val;
    setOptions(updated);
  };

  const addOption = () => {
    if (options.length < 8) {
      setOptions([...options, '']);
    }
  };

  const removeOption = (idx: number) => {
    if (options.length > 2) {
      setOptions(options.filter((_, i) => i !== idx));
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const validOptions = options.map((o) => o.trim()).filter(Boolean);
    if (!question.trim() || validOptions.length < 2) return;

    const poll: PollData = {
      question: question.trim(),
      options: validOptions.map((text, i) => ({
        id: `opt_${Date.now()}_${i}`,
        text,
        votes: 0,
        voterNames: [],
      })),
      allowMultipleAnswers: allowMultiple,
    };

    onSendPoll(poll);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
      <div
        className={`relative w-full max-w-md rounded-2xl overflow-hidden shadow-2xl flex flex-col max-h-[580px] border ${
          isDark ? 'bg-[#111b21] border-slate-800 text-white' : 'bg-white border-slate-200 text-slate-900'
        }`}
      >
        <div className="flex items-center justify-between p-4 border-b border-slate-700/40">
          <h3 className="font-semibold text-base">Create Poll</h3>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-white/10">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 flex flex-col gap-4">
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 block mb-1">
              Question
            </label>
            <input
              type="text"
              required
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Ask a question..."
              className={`w-full px-3 py-2 rounded-lg text-sm outline-none border ${
                isDark ? 'bg-[#202c33] border-slate-700 text-white' : 'bg-slate-50 border-slate-300'
              } focus:border-[#00a884]`}
              autoFocus
            />
          </div>

          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-400 block mb-2">
              Options
            </label>
            <div className="flex flex-col gap-2.5">
              {options.map((opt, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={opt}
                    onChange={(e) => handleOptionChange(idx, e.target.value)}
                    placeholder={`Option ${idx + 1}`}
                    className={`flex-1 px-3 py-2 rounded-lg text-sm outline-none border ${
                      isDark ? 'bg-[#202c33] border-slate-700 text-white' : 'bg-slate-50 border-slate-300'
                    } focus:border-[#00a884]`}
                  />
                  {options.length > 2 && (
                    <button
                      type="button"
                      onClick={() => removeOption(idx)}
                      className="p-2 text-slate-400 hover:text-rose-500 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>

            {options.length < 8 && (
              <button
                type="button"
                onClick={addOption}
                className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-[#00a884] hover:underline"
              >
                <Plus className="w-4 h-4" />
                <span>Add option</span>
              </button>
            )}
          </div>

          <div className="flex items-center justify-between p-3 rounded-xl bg-slate-800/40 border border-slate-700/40">
            <div>
              <div className="text-sm font-semibold">Allow multiple answers</div>
              <div className="text-xs text-slate-400">Users can vote on more than one option</div>
            </div>
            <button
              type="button"
              onClick={() => setAllowMultiple(!allowMultiple)}
              className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors ${
                allowMultiple ? 'bg-[#00a884]' : 'bg-slate-600'
              }`}
            >
              <div
                className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
                  allowMultiple ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          <div className="mt-4 flex items-center justify-end gap-3 pt-3 border-t border-slate-700/40">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-white"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!question.trim() || options.filter((o) => o.trim()).length < 2}
              className="px-5 py-2.5 rounded-full bg-[#00a884] hover:bg-[#008f72] text-white font-semibold text-xs transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-md"
            >
              Send Poll
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
