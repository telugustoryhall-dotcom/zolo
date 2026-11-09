import React from 'react';
import { PollData } from '../types/chat';
import { CheckCircle2, Circle } from 'lucide-react';

interface PollCardProps {
  poll: PollData;
  isOutgoing: boolean;
  theme: 'dark' | 'light';
  onVote: (optionId: string) => void;
}

export const PollCard: React.FC<PollCardProps> = ({
  poll,
  isOutgoing,
  theme,
  onVote,
}) => {
  const totalVotes = poll.options.reduce((acc, opt) => acc + opt.votes, 0);

  return (
    <div className="w-full min-w-[260px] max-w-[360px] flex flex-col gap-2.5 py-1">
      <div className="font-semibold text-[15px] leading-snug">
        {poll.question}
      </div>

      <div className="text-[11px] text-slate-400">
        {poll.allowMultipleAnswers ? 'Select one or more options' : 'Select one option'}
      </div>

      <div className="flex flex-col gap-2">
        {poll.options.map((opt) => {
          const isSelected = poll.userVotedId === opt.id;
          const percentage = totalVotes > 0 ? Math.round((opt.votes / totalVotes) * 100) : 0;

          return (
            <button
              key={opt.id}
              onClick={() => onVote(opt.id)}
              className={`relative overflow-hidden text-left p-2.5 rounded-lg border transition-all active:scale-[0.99] flex flex-col gap-1.5 ${
                isSelected
                  ? theme === 'dark'
                    ? 'border-[#00a884] bg-[#00a884]/15'
                    : 'border-[#008069] bg-[#008069]/10'
                  : theme === 'dark'
                  ? 'border-slate-700 bg-slate-800/40 hover:bg-slate-800/70'
                  : 'border-slate-200 bg-slate-50 hover:bg-slate-100'
              }`}
            >
              {/* Animated Progress Bar fill */}
              <div
                style={{ width: `${percentage}%` }}
                className={`absolute top-0 bottom-0 left-0 transition-all duration-300 pointer-events-none ${
                  isSelected
                    ? theme === 'dark'
                      ? 'bg-[#00a884]/20'
                      : 'bg-[#008069]/15'
                    : theme === 'dark'
                    ? 'bg-slate-700/30'
                    : 'bg-slate-200/50'
                }`}
              />

              <div className="relative z-10 flex items-center justify-between w-full">
                <div className="flex items-center gap-2">
                  {isSelected ? (
                    <CheckCircle2 className="w-4 h-4 text-[#00a884] shrink-0" />
                  ) : (
                    <Circle className="w-4 h-4 text-slate-400 shrink-0" />
                  )}
                  <span className="text-sm font-medium leading-tight">{opt.text}</span>
                </div>
                <span className="text-xs font-semibold tabular-nums text-slate-400 shrink-0 ml-2">
                  {percentage}%
                </span>
              </div>

              {/* Voter count and names */}
              <div className="relative z-10 flex items-center justify-between text-[11px] text-slate-400 pl-6">
                <span>{opt.votes} {opt.votes === 1 ? 'vote' : 'votes'}</span>
                {opt.voterNames.length > 0 && (
                  <span className="truncate max-w-[140px]">
                    {opt.voterNames.join(', ')}
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      <div className="text-[11px] text-right text-slate-400 pt-0.5">
        {totalVotes} total {totalVotes === 1 ? 'vote' : 'votes'}
      </div>
    </div>
  );
};
