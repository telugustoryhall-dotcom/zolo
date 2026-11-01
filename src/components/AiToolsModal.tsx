import React, { useState } from 'react';
import { Sparkles, Languages, CheckSquare, MessageSquare, Copy, Check, Send, Loader2, X, ArrowRightLeft } from 'lucide-react';
import { authApi } from '../utils/authApi';
import type { Message } from '../types/chat';

interface AiToolsModalProps {
  isOpen: boolean;
  onClose: () => void;
  messages: Message[];
  currentInputText?: string;
  onApplyPolishedText?: (text: string) => void;
  onSendAiMessage?: (text: string) => void;
  onAddTaskToWorkspace?: (task: { title: string; assignedTo?: string; dueDate?: string; priority?: 'low' | 'medium' | 'high' }) => void;
  theme: 'dark' | 'light';
}

type TabType = 'summary' | 'telugu' | 'suggestions' | 'decisions';

export const AiToolsModal: React.FC<AiToolsModalProps> = ({
  isOpen,
  onClose,
  messages,
  currentInputText = '',
  onApplyPolishedText,
  onSendAiMessage,
  onAddTaskToWorkspace,
  theme,
}) => {
  const [activeTab, setActiveTab] = useState<TabType>('summary');
  const isDark = theme === 'dark';

  // Summarizer state
  const [summaryLength, setSummaryLength] = useState<'short' | 'medium' | 'detailed'>('medium');
  const [summaryResult, setSummaryResult] = useState<{
    summary: string;
    keyPoints: string[];
    actionItems: string[];
    decisions: string[];
  } | null>(null);
  const [isSummarizing, setIsSummarizing] = useState(false);

  // Telugu Translator state
  const [teluguInput, setTeluguInput] = useState(currentInputText || '');
  const [translateDirection, setTranslateDirection] = useState<'auto' | 'te_to_en' | 'en_to_te'>('auto');
  const [translateTone, setTranslateTone] = useState<'polite' | 'casual' | 'concise'>('polite');
  const [translateResult, setTranslateResult] = useState<{
    original: string;
    translated: string;
    transliteration?: string;
    detectedLanguage: string;
  } | null>(null);
  const [isTranslating, setIsTranslating] = useState(false);

  // Smart suggestions & polish state
  const [polishInput, setPolishInput] = useState(currentInputText || '');
  const [polishTone, setPolishTone] = useState('friendly');
  const [polishResult, setPolishResult] = useState<{
    polished?: string;
    improvements?: string[];
  } | null>(null);
  const [suggestedReplies, setSuggestedReplies] = useState<Array<{ text: string; label: string; tone: string }>>([]);
  const [isLoadingReplies, setIsLoadingReplies] = useState(false);
  const [isPolishing, setIsPolishing] = useState(false);

  // Decision & Task detector state
  const [decisionsResult, setDecisionsResult] = useState<{
    tasks: Array<{ title: string; assignedTo?: string; dueDate?: string; priority: 'low' | 'medium' | 'high' }>;
    decisions: Array<{ description: string; agreedBy: string[] }>;
  } | null>(null);
  const [isExtractingDecisions, setIsExtractingDecisions] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleGenerateSummary = async () => {
    setIsSummarizing(true);
    try {
      const formatted = messages.map((m) => ({
        senderName: m.senderName,
        text: m.text,
      }));
      const res = await authApi.summarizeChat({
        messages: formatted,
        length: summaryLength,
      });
      setSummaryResult(res);
    } catch (e) {
      console.error('Summarize error:', e);
    } finally {
      setIsSummarizing(false);
    }
  };

  const handleTranslateTelugu = async () => {
    if (!teluguInput.trim()) return;
    setIsTranslating(true);
    try {
      const res = await authApi.translateTelugu({
        text: teluguInput.trim(),
        direction: translateDirection,
        tone: translateTone,
        includeTransliteration: true,
      });
      setTranslateResult(res);
    } catch (e) {
      console.error('Translation error:', e);
    } finally {
      setIsTranslating(false);
    }
  };

  const handleLoadSuggestions = async () => {
    setIsLoadingReplies(true);
    try {
      const recent = messages.slice(-8).map((m) => ({
        senderName: m.senderName,
        text: m.text,
      }));
      const res = await authApi.suggestOrPolish({
        contextMessages: recent,
        action: 'suggest',
      });
      if (res.suggestions) {
        setSuggestedReplies(res.suggestions);
      }
    } catch (e) {
      console.error('Suggestions error:', e);
    } finally {
      setIsLoadingReplies(false);
    }
  };

  const handlePolishText = async () => {
    if (!polishInput.trim()) return;
    setIsPolishing(true);
    try {
      const res = await authApi.suggestOrPolish({
        text: polishInput.trim(),
        action: 'polish',
        style: polishTone,
      });
      setPolishResult(res);
    } catch (e) {
      console.error('Polish error:', e);
    } finally {
      setIsPolishing(false);
    }
  };

  const handleExtractDecisions = async () => {
    setIsExtractingDecisions(true);
    try {
      const formatted = messages.map((m) => ({
        senderName: m.senderName,
        text: m.text,
      }));
      const res = await authApi.extractDecisions({ messages: formatted });
      setDecisionsResult(res);
    } catch (e) {
      console.error('Decisions error:', e);
    } finally {
      setIsExtractingDecisions(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div
        className={`w-full max-w-2xl rounded-2xl shadow-2xl flex flex-col overflow-hidden max-h-[90vh] border ${
          isDark ? 'bg-[#111b21] border-[#222e35] text-white' : 'bg-white border-gray-200 text-gray-900'
        }`}
      >
        {/* Header */}
        <div className={`p-4 flex items-center justify-between border-b ${isDark ? 'border-[#222e35] bg-[#202c33]' : 'border-gray-200 bg-gray-50'}`}>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-semibold text-base flex items-center gap-2">
                ZOLO AI Assistant
                <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-normal">
                  Gemini 3.8 Flash
                </span>
              </h2>
              <p className="text-xs opacity-60">Smart conversation summaries, Telugu translation & reply tools</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className={`p-1.5 rounded-full hover:bg-black/10 dark:hover:bg-white/10 transition`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className={`flex border-b overflow-x-auto ${isDark ? 'border-[#222e35] bg-[#111b21]' : 'border-gray-200 bg-white'}`}>
          <button
            onClick={() => {
              setActiveTab('summary');
              if (!summaryResult) handleGenerateSummary();
            }}
            className={`flex items-center gap-2 px-4 py-3 text-xs font-medium border-b-2 transition whitespace-nowrap ${
              activeTab === 'summary'
                ? 'border-emerald-500 text-emerald-500 bg-emerald-500/5'
                : 'border-transparent opacity-70 hover:opacity-100'
            }`}
          >
            <MessageSquare className="w-4 h-4" />
            Conversation Summary
          </button>
          <button
            onClick={() => setActiveTab('telugu')}
            className={`flex items-center gap-2 px-4 py-3 text-xs font-medium border-b-2 transition whitespace-nowrap ${
              activeTab === 'telugu'
                ? 'border-emerald-500 text-emerald-500 bg-emerald-500/5'
                : 'border-transparent opacity-70 hover:opacity-100'
            }`}
          >
            <Languages className="w-4 h-4" />
            Telugu & English
          </button>
          <button
            onClick={() => {
              setActiveTab('suggestions');
              if (suggestedReplies.length === 0) handleLoadSuggestions();
            }}
            className={`flex items-center gap-2 px-4 py-3 text-xs font-medium border-b-2 transition whitespace-nowrap ${
              activeTab === 'suggestions'
                ? 'border-emerald-500 text-emerald-500 bg-emerald-500/5'
                : 'border-transparent opacity-70 hover:opacity-100'
            }`}
          >
            <Sparkles className="w-4 h-4" />
            Replies & Polish
          </button>
          <button
            onClick={() => {
              setActiveTab('decisions');
              if (!decisionsResult) handleExtractDecisions();
            }}
            className={`flex items-center gap-2 px-4 py-3 text-xs font-medium border-b-2 transition whitespace-nowrap ${
              activeTab === 'decisions'
                ? 'border-emerald-500 text-emerald-500 bg-emerald-500/5'
                : 'border-transparent opacity-70 hover:opacity-100'
            }`}
          >
            <CheckSquare className="w-4 h-4" />
            Decisions & Tasks
          </button>
        </div>

        {/* Tab Body */}
        <div className="p-5 overflow-y-auto flex-1 space-y-4">
          {/* TAB 1: SUMMARY */}
          {activeTab === 'summary' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs opacity-70 font-medium">Summary Length:</span>
                  <div className={`flex rounded-lg p-0.5 border ${isDark ? 'bg-[#202c33] border-[#2a3942]' : 'bg-gray-100 border-gray-200'}`}>
                    {(['short', 'medium', 'detailed'] as const).map((len) => (
                      <button
                        key={len}
                        onClick={() => setSummaryLength(len)}
                        className={`px-3 py-1 rounded-md text-xs font-medium capitalize transition ${
                          summaryLength === len
                            ? 'bg-emerald-600 text-white shadow-sm'
                            : 'opacity-70 hover:opacity-100'
                        }`}
                      >
                        {len}
                      </button>
                    ))}
                  </div>
                </div>
                <button
                  onClick={handleGenerateSummary}
                  disabled={isSummarizing}
                  className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium flex items-center gap-1.5 transition disabled:opacity-50"
                >
                  {isSummarizing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                  {summaryResult ? 'Regenerate' : 'Generate'}
                </button>
              </div>

              {isSummarizing && (
                <div className="py-12 flex flex-col items-center justify-center gap-3">
                  <Loader2 className="w-7 h-7 animate-spin text-emerald-500" />
                  <p className="text-xs opacity-70">Analyzing messages with Gemini 3.8 Flash...</p>
                </div>
              )}

              {!isSummarizing && summaryResult && (
                <div className="space-y-4">
                  <div className={`p-4 rounded-xl border ${isDark ? 'bg-[#182229] border-[#222e35]' : 'bg-emerald-50/50 border-emerald-100'}`}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-emerald-500 uppercase tracking-wider">Overview</span>
                      <button
                        onClick={() => handleCopy(summaryResult.summary, 'sum')}
                        className="p-1 rounded hover:bg-black/10 dark:hover:bg-white/10 text-xs opacity-70 flex items-center gap-1"
                      >
                        {copiedKey === 'sum' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                    <p className="text-sm leading-relaxed">{summaryResult.summary}</p>
                  </div>

                  {summaryResult.keyPoints?.length > 0 && (
                    <div className={`p-4 rounded-xl border ${isDark ? 'bg-[#182229] border-[#222e35]' : 'bg-gray-50 border-gray-200'}`}>
                      <h4 className="text-xs font-semibold uppercase tracking-wider opacity-70 mb-2">Key Highlights</h4>
                      <ul className="space-y-1.5 text-sm">
                        {summaryResult.keyPoints.map((pt, i) => (
                          <li key={i} className="flex items-start gap-2">
                            <span className="text-emerald-500 font-bold">•</span>
                            <span>{pt}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {summaryResult.actionItems?.length > 0 && (
                    <div className={`p-4 rounded-xl border ${isDark ? 'bg-[#182229] border-[#222e35]' : 'bg-amber-50/40 border-amber-200'}`}>
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-amber-500 mb-2">Action Items</h4>
                      <ul className="space-y-1.5 text-sm">
                        {summaryResult.actionItems.map((act, i) => (
                          <li key={i} className="flex items-start gap-2">
                            <span className="text-amber-500 font-bold">✓</span>
                            <span>{act}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {summaryResult.decisions?.length > 0 && (
                    <div className={`p-4 rounded-xl border ${isDark ? 'bg-[#182229] border-[#222e35]' : 'bg-blue-50/40 border-blue-200'}`}>
                      <h4 className="text-xs font-semibold uppercase tracking-wider text-blue-500 mb-2">Decisions Reached</h4>
                      <ul className="space-y-1.5 text-sm">
                        {summaryResult.decisions.map((dec, i) => (
                          <li key={i} className="flex items-start gap-2">
                            <span className="text-blue-500 font-bold">★</span>
                            <span>{dec}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  <div className="flex justify-end gap-2 pt-2">
                    <button
                      onClick={() => {
                        const fullText = `*Conversation Summary:*\n${summaryResult.summary}\n\n*Key Highlights:*\n${summaryResult.keyPoints.map((p) => `• ${p}`).join('\n')}`;
                        onSendAiMessage?.(fullText);
                        onClose();
                      }}
                      className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium flex items-center gap-1.5 shadow"
                    >
                      <Send className="w-3.5 h-3.5" />
                      Share in Chat
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: TELUGU TRANSLATION */}
          {activeTab === 'telugu' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs opacity-70 font-medium block mb-1">Direction</label>
                  <select
                    value={translateDirection}
                    onChange={(e) => setTranslateDirection(e.target.value as any)}
                    className={`w-full p-2 rounded-lg text-xs border ${
                      isDark ? 'bg-[#202c33] border-[#2a3942]' : 'bg-gray-50 border-gray-300'
                    }`}
                  >
                    <option value="auto">Auto-detect (Telugu ⇋ English)</option>
                    <option value="te_to_en">Telugu ➔ English</option>
                    <option value="en_to_te">English ➔ Telugu</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs opacity-70 font-medium block mb-1">Tone & Politeness</label>
                  <select
                    value={translateTone}
                    onChange={(e) => setTranslateTone(e.target.value as any)}
                    className={`w-full p-2 rounded-lg text-xs border ${
                      isDark ? 'bg-[#202c33] border-[#2a3942]' : 'bg-gray-50 border-gray-300'
                    }`}
                  >
                    <option value="polite">Polite & Respectful (మర్యాదపూర్వక)</option>
                    <option value="casual">Casual & Friendly (స్నేహపూర్వక)</option>
                    <option value="concise">Concise & Direct (సూటిగా)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs opacity-70 font-medium block mb-1">Input Text</label>
                <textarea
                  value={teluguInput}
                  onChange={(e) => setTeluguInput(e.target.value)}
                  placeholder="Type in Telugu script or Romanized Telugu (e.g. 'Nuvvu ela unnavu?') or English..."
                  rows={3}
                  className={`w-full p-3 rounded-xl text-sm border resize-none focus:outline-none focus:ring-1 focus:ring-emerald-500 ${
                    isDark ? 'bg-[#202c33] border-[#2a3942]' : 'bg-white border-gray-300'
                  }`}
                />
              </div>

              <div className="flex justify-end">
                <button
                  onClick={handleTranslateTelugu}
                  disabled={isTranslating || !teluguInput.trim()}
                  className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium flex items-center gap-1.5 transition disabled:opacity-50"
                >
                  {isTranslating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ArrowRightLeft className="w-3.5 h-3.5" />}
                  Translate & Transliterate
                </button>
              </div>

              {translateResult && (
                <div className="space-y-3 pt-2">
                  <div className={`p-4 rounded-xl border ${isDark ? 'bg-[#182229] border-[#222e35]' : 'bg-emerald-50/50 border-emerald-100'}`}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-emerald-500 uppercase tracking-wider">
                        Translation ({translateResult.detectedLanguage})
                      </span>
                      <button
                        onClick={() => handleCopy(translateResult.translated, 'tr')}
                        className="p-1 rounded hover:bg-black/10 dark:hover:bg-white/10 text-xs opacity-70 flex items-center gap-1"
                      >
                        {copiedKey === 'tr' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                    <p className="text-base font-medium leading-relaxed">{translateResult.translated}</p>
                  </div>

                  {translateResult.transliteration && (
                    <div className={`p-3 rounded-xl border text-xs ${isDark ? 'bg-[#202c33] border-[#2a3942]' : 'bg-gray-100 border-gray-200'}`}>
                      <span className="font-semibold opacity-70 block mb-1">Romanized Transliteration:</span>
                      <p className="italic opacity-90">{translateResult.transliteration}</p>
                    </div>
                  )}

                  <div className="flex justify-end gap-2 pt-2">
                    <button
                      onClick={() => {
                        onApplyPolishedText?.(translateResult.translated);
                        onClose();
                      }}
                      className="px-3 py-1.5 rounded-lg border border-emerald-500/30 hover:bg-emerald-500/10 text-emerald-400 text-xs font-medium"
                    >
                      Insert in Input
                    </button>
                    <button
                      onClick={() => {
                        onSendAiMessage?.(translateResult.translated);
                        onClose();
                      }}
                      className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium flex items-center gap-1.5 shadow"
                    >
                      <Send className="w-3.5 h-3.5" />
                      Send Directly
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: SMART REPLIES & POLISH */}
          {activeTab === 'suggestions' && (
            <div className="space-y-5">
              {/* Context Quick Replies */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-xs font-semibold uppercase tracking-wider opacity-70">
                    Smart In-Context Quick Replies
                  </h4>
                  <button
                    onClick={handleLoadSuggestions}
                    disabled={isLoadingReplies}
                    className="text-xs text-emerald-400 hover:underline flex items-center gap-1"
                  >
                    {isLoadingReplies ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                    Refresh Replies
                  </button>
                </div>

                {isLoadingReplies && (
                  <div className="py-6 flex justify-center">
                    <Loader2 className="w-5 h-5 animate-spin text-emerald-500" />
                  </div>
                )}

                {!isLoadingReplies && suggestedReplies.length > 0 && (
                  <div className="grid grid-cols-1 gap-2">
                    {suggestedReplies.map((s, idx) => (
                      <div
                        key={idx}
                        className={`p-3 rounded-xl border flex items-center justify-between transition ${
                          isDark ? 'bg-[#182229] border-[#222e35] hover:border-emerald-500/50' : 'bg-gray-50 border-gray-200 hover:border-emerald-500'
                        }`}
                      >
                        <div>
                          <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400 block mb-0.5">
                            {s.label} ({s.tone})
                          </span>
                          <p className="text-xs">{s.text}</p>
                        </div>
                        <div className="flex items-center gap-1 ml-3">
                          <button
                            onClick={() => {
                              onApplyPolishedText?.(s.text);
                              onClose();
                            }}
                            className="px-2.5 py-1 text-xs rounded-md border border-white/10 hover:bg-white/10"
                          >
                            Use
                          </button>
                          <button
                            onClick={() => {
                              onSendAiMessage?.(s.text);
                              onClose();
                            }}
                            className="p-1.5 rounded-md bg-emerald-600 text-white hover:bg-emerald-500"
                          >
                            <Send className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Polish My Message */}
              <div className="pt-3 border-t border-white/10">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-xs font-semibold uppercase tracking-wider opacity-70">
                    Smart Polish & Grammar Enhancer
                  </h4>
                  <div className="flex items-center gap-1 text-xs">
                    {(['friendly', 'professional', 'concise'] as const).map((st) => (
                      <button
                        key={st}
                        onClick={() => setPolishTone(st)}
                        className={`px-2 py-0.5 rounded capitalize ${
                          polishTone === st
                            ? 'bg-emerald-600 text-white'
                            : 'opacity-60 hover:opacity-100'
                        }`}
                      >
                        {st}
                      </button>
                    ))}
                  </div>
                </div>

                <textarea
                  value={polishInput}
                  onChange={(e) => setPolishInput(e.target.value)}
                  placeholder="Type draft message to polish for grammar, clarity, and tone..."
                  rows={2}
                  className={`w-full p-2.5 rounded-xl text-xs border resize-none focus:outline-none focus:ring-1 focus:ring-emerald-500 ${
                    isDark ? 'bg-[#202c33] border-[#2a3942]' : 'bg-white border-gray-300'
                  }`}
                />

                <div className="flex justify-end mt-2">
                  <button
                    onClick={handlePolishText}
                    disabled={isPolishing || !polishInput.trim()}
                    className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium flex items-center gap-1.5 transition disabled:opacity-50"
                  >
                    {isPolishing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                    Polish Text
                  </button>
                </div>

                {polishResult?.polished && (
                  <div className={`mt-3 p-3 rounded-xl border ${isDark ? 'bg-[#182229] border-[#222e35]' : 'bg-emerald-50/50 border-emerald-100'}`}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] font-semibold text-emerald-500 uppercase">Polished Version</span>
                    </div>
                    <p className="text-xs mb-2">{polishResult.polished}</p>
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => {
                          onApplyPolishedText?.(polishResult.polished!);
                          onClose();
                        }}
                        className="px-3 py-1 rounded bg-emerald-600 text-white text-xs hover:bg-emerald-500"
                      >
                        Apply to Chat
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 4: DECISIONS & TASKS */}
          {activeTab === 'decisions' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-xs opacity-70">
                  Scans recent conversation for commitments, tasks, and confirmed decisions.
                </p>
                <button
                  onClick={handleExtractDecisions}
                  disabled={isExtractingDecisions}
                  className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium flex items-center gap-1.5 transition disabled:opacity-50"
                >
                  {isExtractingDecisions ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckSquare className="w-3.5 h-3.5" />}
                  Detect Again
                </button>
              </div>

              {isExtractingDecisions && (
                <div className="py-12 flex flex-col items-center justify-center gap-3">
                  <Loader2 className="w-7 h-7 animate-spin text-emerald-500" />
                  <p className="text-xs opacity-70">Detecting decisions and tasks...</p>
                </div>
              )}

              {!isExtractingDecisions && decisionsResult && (
                <div className="space-y-4">
                  <div>
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-emerald-500 mb-2">
                      Detected Action Items & Tasks ({decisionsResult.tasks.length})
                    </h4>
                    {decisionsResult.tasks.length === 0 ? (
                      <p className="text-xs opacity-50 italic">No explicit tasks detected in recent messages.</p>
                    ) : (
                      <div className="space-y-2">
                        {decisionsResult.tasks.map((task, i) => (
                          <div
                            key={i}
                            className={`p-3 rounded-xl border flex items-center justify-between ${
                              isDark ? 'bg-[#182229] border-[#222e35]' : 'bg-gray-50 border-gray-200'
                            }`}
                          >
                            <div>
                              <div className="flex items-center gap-2 mb-0.5">
                                <span className={`text-[10px] px-1.5 py-0.5 rounded uppercase font-semibold ${
                                  task.priority === 'high' ? 'bg-red-500/20 text-red-400' : 'bg-amber-500/20 text-amber-400'
                                }`}>
                                  {task.priority}
                                </span>
                                {task.assignedTo && (
                                  <span className="text-[10px] opacity-60">Assigned: {task.assignedTo}</span>
                                )}
                                {task.dueDate && (
                                  <span className="text-[10px] opacity-60">Due: {task.dueDate}</span>
                                )}
                              </div>
                              <p className="text-xs font-medium">{task.title}</p>
                            </div>
                            {onAddTaskToWorkspace && (
                              <button
                                onClick={() => {
                                  onAddTaskToWorkspace(task);
                                  handleCopy('added', `task_${i}`);
                                }}
                                className="px-2.5 py-1 text-xs rounded-lg bg-emerald-600/20 hover:bg-emerald-600 text-emerald-400 hover:text-white transition whitespace-nowrap ml-2"
                              >
                                {copiedKey === `task_${i}` ? 'Added!' : '+ Add to Tasks'}
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div>
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-blue-500 mb-2">
                      Confirmed Decisions ({decisionsResult.decisions.length})
                    </h4>
                    {decisionsResult.decisions.length === 0 ? (
                      <p className="text-xs opacity-50 italic">No formal decisions detected.</p>
                    ) : (
                      <div className="space-y-2">
                        {decisionsResult.decisions.map((dec, i) => (
                          <div
                            key={i}
                            className={`p-3 rounded-xl border ${
                              isDark ? 'bg-[#182229] border-[#222e35]' : 'bg-blue-50/40 border-blue-200'
                            }`}
                          >
                            <p className="text-xs font-medium">{dec.description}</p>
                            {dec.agreedBy?.length > 0 && (
                              <p className="text-[10px] opacity-60 mt-1">Agreed by: {dec.agreedBy.join(', ')}</p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
