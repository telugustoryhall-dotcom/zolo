import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Gamepad2, Trophy, RotateCcw, Send, X, Flame, Play,
  Circle, X as XIcon, HelpCircle, Check, Award, ArrowUp, ArrowDown
} from 'lucide-react';
import type { Contact } from '../types/chat';

import { KartRacingGame } from './games/KartRacingGame';
import { EightBallPoolGame } from './games/EightBallPoolGame';

interface ZoloPlayModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentContact?: Contact | null;
  onShareToChat?: (text: string) => void;
  theme: 'dark' | 'light';
}

type GameMode = 'kart' | 'pool' | 'tictactoe' | 'hoops' | 'quiz' | 'runner';

export const ZoloPlayModal: React.FC<ZoloPlayModalProps> = ({
  isOpen,
  onClose,
  currentContact,
  onShareToChat,
  theme,
}) => {
  const [selectedGame, setSelectedGame] = useState<GameMode>('tictactoe');
  const isDark = theme === 'dark';

  // -------------------------------------------------------------
  // 1. TIC-TAC-TOE STATE
  // -------------------------------------------------------------
  const [tttBoard, setTttBoard] = useState<Array<string | null>>(Array(9).fill(null));
  const [tttTurn, setTttTurn] = useState<'X' | 'O'>('X');
  const [tttWinner, setTttWinner] = useState<string | null>(null);
  const [tttWinningLine, setTttWinningLine] = useState<number[] | null>(null);
  const [tttVsAi, setTttVsAi] = useState(true);
  const [tttScore, setTttScore] = useState({ xWins: 0, oWins: 0, draws: 0 });

  const checkTttWinner = (board: Array<string | null>) => {
    const lines = [
      [0, 1, 2], [3, 4, 5], [6, 7, 8],
      [0, 3, 6], [1, 4, 7], [2, 5, 8],
      [0, 4, 8], [2, 4, 6]
    ];
    for (const [a, b, c] of lines) {
      if (board[a] && board[a] === board[b] && board[a] === board[c]) {
        return { winner: board[a], line: [a, b, c] };
      }
    }
    if (board.every((cell) => cell !== null)) {
      return { winner: 'draw', line: null };
    }
    return null;
  };

  const handleTttClick = (index: number) => {
    if (tttBoard[index] || tttWinner) return;

    const next = [...tttBoard];
    next[index] = tttTurn;
    const res = checkTttWinner(next);

    if (res) {
      setTttBoard(next);
      setTttWinner(res.winner);
      setTttWinningLine(res.line);
      if (res.winner === 'X') setTttScore((s) => ({ ...s, xWins: s.xWins + 1 }));
      else if (res.winner === 'O') setTttScore((s) => ({ ...s, oWins: s.oWins + 1 }));
      else setTttScore((s) => ({ ...s, draws: s.draws + 1 }));
      return;
    }

    if (tttVsAi && tttTurn === 'X') {
      next[index] = 'X';
      setTttBoard(next);
      setTttTurn('O');

      // AI Move
      setTimeout(() => {
        const available = next
          .map((v, i) => (v === null ? i : null))
          .filter((v): v is number => v !== null);

        if (available.length > 0) {
          // Check if AI can win or block
          let move = available[Math.floor(Math.random() * available.length)];
          for (const cand of available) {
            const test = [...next];
            test[cand] = 'O';
            if (checkTttWinner(test)?.winner === 'O') {
              move = cand;
              break;
            }
          }
          for (const cand of available) {
            const test = [...next];
            test[cand] = 'X';
            if (checkTttWinner(test)?.winner === 'X') {
              move = cand;
              break;
            }
          }

          next[move] = 'O';
          const aiRes = checkTttWinner(next);
          setTttBoard(next);
          if (aiRes) {
            setTttWinner(aiRes.winner);
            setTttWinningLine(aiRes.line);
            if (aiRes.winner === 'O') setTttScore((s) => ({ ...s, oWins: s.oWins + 1 }));
            else if (aiRes.winner === 'draw') setTttScore((s) => ({ ...s, draws: s.draws + 1 }));
          } else {
            setTttTurn('X');
          }
        }
      }, 350);
    } else {
      setTttBoard(next);
      setTttTurn(tttTurn === 'X' ? 'O' : 'X');
    }
  };

  const resetTtt = () => {
    setTttBoard(Array(9).fill(null));
    setTttTurn('X');
    setTttWinner(null);
    setTttWinningLine(null);
  };

  // -------------------------------------------------------------
  // 2. ZOLO HOOPS (BASKETBALL CANVAS)
  // -------------------------------------------------------------
  const hoopsCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [hoopsScore, setHoopsScore] = useState(0);
  const [hoopsStreak, setHoopsStreak] = useState(0);
  const [hoopsTimeLeft, setHoopsTimeLeft] = useState(45);
  const [hoopsGameOver, setHoopsGameOver] = useState(false);
  const hoopsStateRef = useRef({
    ball: { x: 180, y: 320, vx: 0, vy: 0, radius: 16, active: false },
    dragStart: { x: 0, y: 0, dragging: false },
    currentMouse: { x: 0, y: 0 },
    rim: { x: 180, y: 100, width: 60, height: 10 },
    backboard: { x: 215, y: 50, width: 8, height: 90 },
    score: 0,
    streak: 0,
    isPlaying: true,
  });

  useEffect(() => {
    if (selectedGame !== 'hoops' || !isOpen) return;

    let animId: number;
    const canvas = hoopsCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    hoopsStateRef.current.score = hoopsScore;
    hoopsStateRef.current.streak = hoopsStreak;

    const timer = setInterval(() => {
      setHoopsTimeLeft((t) => {
        if (t <= 1) {
          clearInterval(timer);
          setHoopsGameOver(true);
          return 0;
        }
        return t - 1;
      });
    }, 1000);

    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Court background gradient
      const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
      grad.addColorStop(0, '#0f172a');
      grad.addColorStop(1, '#1e293b');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const state = hoopsStateRef.current;
      const { ball, rim, backboard, dragStart, currentMouse } = state;

      // Draw Backboard & Pole
      ctx.fillStyle = '#64748b';
      ctx.fillRect(backboard.x - 2, backboard.y + backboard.height, 4, 180);
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(backboard.x, backboard.y, backboard.width, backboard.height);
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 2;
      ctx.strokeRect(backboard.x - 1, backboard.y + 35, 6, 30);

      // Draw Rim & Net
      ctx.fillStyle = '#f97316';
      ctx.fillRect(rim.x, rim.y, rim.width, rim.height);

      // Net lines
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(rim.x, rim.y + rim.height);
      ctx.lineTo(rim.x + 10, rim.y + 35);
      ctx.lineTo(rim.x + rim.width - 10, rim.y + 35);
      ctx.lineTo(rim.x + rim.width, rim.y + rim.height);
      ctx.stroke();

      // Aiming trajectory guide
      if (dragStart.dragging) {
        const dx = dragStart.x - currentMouse.x;
        const dy = dragStart.y - currentMouse.y;
        ctx.strokeStyle = '#22c55e';
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(ball.x, ball.y);
        ctx.lineTo(ball.x + dx, ball.y + dy);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Ball Physics
      if (ball.active) {
        ball.vy += 0.35; // gravity
        ball.x += ball.vx;
        ball.y += ball.vy;

        // Bounce backboard
        if (
          ball.x + ball.radius >= backboard.x &&
          ball.x - ball.radius <= backboard.x + backboard.width &&
          ball.y >= backboard.y &&
          ball.y <= backboard.y + backboard.height
        ) {
          ball.vx = -Math.abs(ball.vx) * 0.7;
        }

        // Score detection (entering hoop downwards)
        if (
          ball.y >= rim.y &&
          ball.y <= rim.y + 15 &&
          ball.x >= rim.x &&
          ball.x <= rim.x + rim.width &&
          ball.vy > 0
        ) {
          const newStreak = state.streak + 1;
          const points = 2 + (newStreak > 2 ? 1 : 0);
          state.score += points;
          state.streak = newStreak;
          setHoopsScore(state.score);
          setHoopsStreak(newStreak);

          // Reset ball after swish
          ball.active = false;
          ball.x = 180;
          ball.y = 320;
          ball.vx = 0;
          ball.vy = 0;
        }

        // Ball out of bounds / floor
        if (ball.y > canvas.height + 30 || ball.x < -30 || ball.x > canvas.width + 30) {
          state.streak = 0;
          setHoopsStreak(0);
          ball.active = false;
          ball.x = 180;
          ball.y = 320;
          ball.vx = 0;
          ball.vy = 0;
        }
      }

      // Draw Ball
      ctx.save();
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
      ctx.fillStyle = '#ea580c';
      ctx.fill();
      ctx.strokeStyle = '#9a3412';
      ctx.lineWidth = 2;
      ctx.stroke();
      // Seams
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI);
      ctx.stroke();
      ctx.restore();

      animId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animId);
      clearInterval(timer);
    };
  }, [selectedGame, isOpen]);

  const handleHoopsMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = hoopsCanvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    hoopsStateRef.current.dragStart = { x, y, dragging: true };
    hoopsStateRef.current.currentMouse = { x, y };
  };

  const handleHoopsMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!hoopsStateRef.current.dragStart.dragging) return;
    const rect = hoopsCanvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    hoopsStateRef.current.currentMouse = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  };

  const handleHoopsMouseUp = () => {
    const state = hoopsStateRef.current;
    if (!state.dragStart.dragging) return;
    state.dragStart.dragging = false;

    if (!state.ball.active && !hoopsGameOver) {
      const dx = state.dragStart.x - state.currentMouse.x;
      const dy = state.dragStart.y - state.currentMouse.y;
      state.ball.vx = Math.max(-12, Math.min(12, dx * 0.12));
      state.ball.vy = Math.max(-16, Math.min(-4, dy * 0.12));
      state.ball.active = true;
    }
  };

  // -------------------------------------------------------------
  // 3. ZOLO QUIZ STATE
  // -------------------------------------------------------------
  const QUIZ_QUESTIONS = [
    {
      question: 'Which protocol powers real-time low-latency voice and video calls in ZOLO?',
      options: ['WebRTC', 'FTP', 'SMTP', 'POP3'],
      answer: 0,
      explanation: 'WebRTC (Web Real-Time Communication) provides direct peer-to-peer audio/video streaming with STUN/TURN traversal.',
    },
    {
      question: 'What is the standard national dialing code for India in normalized phone format?',
      options: ['+1', '+44', '+91', '+61'],
      answer: 2,
      explanation: '+91 is the country calling code for India used by ZOLO.',
    },
    {
      question: 'Which Google model series delivers high-efficiency messaging intelligence in ZOLO?',
      options: ['Gemini 3.8 Flash', 'GPT-2', 'BERT 2018', 'Word2Vec'],
      answer: 0,
      explanation: 'Gemini 3.8 Flash delivers fast, low-latency summarization, translation, and task extraction.',
    },
    {
      question: 'In basketball, what is the term when a shot goes directly through the hoop without hitting the rim or backboard?',
      options: ['Alley-oop', 'Swish', 'Dunk', 'Layup'],
      answer: 1,
      explanation: 'A swish is a perfect shot that passes cleanly through the net.',
    },
    {
      question: 'Which Telugu greeting is universally used to ask "How are you?"',
      options: ['Bagunnara?', 'Namaskaram', 'Vastanu', 'Danyavadalu'],
      answer: 0,
      explanation: '"Bagunnara?" or "Ela unnaru?" means "How are you?" in Telugu.',
    },
  ];

  const [quizIndex, setQuizIndex] = useState(0);
  const [quizScore, setQuizScore] = useState(0);
  const [quizSelectedOption, setQuizSelectedOption] = useState<number | null>(null);
  const [quizAnswered, setQuizAnswered] = useState(false);
  const [quizCompleted, setQuizCompleted] = useState(false);

  const handleQuizSelect = (idx: number) => {
    if (quizAnswered) return;
    setQuizSelectedOption(idx);
    setQuizAnswered(true);
    if (idx === QUIZ_QUESTIONS[quizIndex].answer) {
      setQuizScore((s) => s + 20);
    }
  };

  const handleNextQuizQuestion = () => {
    if (quizIndex + 1 < QUIZ_QUESTIONS.length) {
      setQuizIndex((i) => i + 1);
      setQuizSelectedOption(null);
      setQuizAnswered(false);
    } else {
      setQuizCompleted(true);
    }
  };

  const resetQuiz = () => {
    setQuizIndex(0);
    setQuizScore(0);
    setQuizSelectedOption(null);
    setQuizAnswered(false);
    setQuizCompleted(false);
  };

  // -------------------------------------------------------------
  // 4. ZOLO DASH (RUNNER)
  // -------------------------------------------------------------
  const runnerCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [runnerScore, setRunnerScore] = useState(0);
  const [runnerGameOver, setRunnerGameOver] = useState(false);
  const runnerStateRef = useRef({
    player: { x: 40, y: 160, vy: 0, width: 22, height: 32, isGrounded: true },
    obstacles: [] as Array<{ x: number; y: number; width: number; height: number; speed: number }>,
    coins: [] as Array<{ x: number; y: number; radius: number; collected: boolean }>,
    score: 0,
    speed: 3.5,
    frameCount: 0,
    active: true,
  });

  const jumpRunner = useCallback(() => {
    const p = runnerStateRef.current.player;
    if (p.isGrounded && runnerStateRef.current.active) {
      p.vy = -9.5;
      p.isGrounded = false;
    }
  }, []);

  useEffect(() => {
    if (selectedGame !== 'runner' || !isOpen) return;

    let animId: number;
    const canvas = runnerCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const state = runnerStateRef.current;
    state.active = true;
    state.score = 0;
    state.obstacles = [];
    state.coins = [];
    state.player.y = 160;
    state.player.vy = 0;
    state.player.isGrounded = true;
    setRunnerGameOver(false);
    setRunnerScore(0);

    const groundY = 190;

    const render = () => {
      if (!state.active) return;
      state.frameCount++;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Sky & Ground
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, canvas.width, groundY);
      ctx.fillStyle = '#065f46';
      ctx.fillRect(0, groundY, canvas.width, canvas.height - groundY);

      // Ground Line
      ctx.strokeStyle = '#10b981';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, groundY);
      ctx.lineTo(canvas.width, groundY);
      ctx.stroke();

      // Player update
      const p = state.player;
      p.vy += 0.45; // Gravity
      p.y += p.vy;
      if (p.y >= groundY - p.height) {
        p.y = groundY - p.height;
        p.vy = 0;
        p.isGrounded = true;
      }

      // Draw Player
      ctx.fillStyle = '#10b981';
      ctx.fillRect(p.x, p.y, p.width, p.height);
      // Eye
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(p.x + p.width - 6, p.y + 6, 4, 4);

      // Spawn Obstacles
      if (state.frameCount % 90 === 0) {
        state.obstacles.push({
          x: canvas.width + 10,
          y: groundY - 24,
          width: 16,
          height: 24,
          speed: state.speed,
        });
      }

      // Spawn Coins
      if (state.frameCount % 65 === 0) {
        state.coins.push({
          x: canvas.width + 10,
          y: groundY - 45 - Math.random() * 30,
          radius: 8,
          collected: false,
        });
      }

      // Update & Draw Obstacles
      for (let i = state.obstacles.length - 1; i >= 0; i--) {
        const obs = state.obstacles[i];
        obs.x -= state.speed;

        ctx.fillStyle = '#ef4444';
        ctx.fillRect(obs.x, obs.y, obs.width, obs.height);

        // Collision Check
        if (
          p.x < obs.x + obs.width &&
          p.x + p.width > obs.x &&
          p.y < obs.y + obs.height &&
          p.y + p.height > obs.y
        ) {
          state.active = false;
          setRunnerGameOver(true);
          return;
        }

        if (obs.x < -30) {
          state.obstacles.splice(i, 1);
          state.score += 5;
          setRunnerScore(state.score);
        }
      }

      // Update & Draw Coins
      for (let i = state.coins.length - 1; i >= 0; i--) {
        const coin = state.coins[i];
        coin.x -= state.speed;

        if (!coin.collected) {
          ctx.beginPath();
          ctx.arc(coin.x, coin.y, coin.radius, 0, Math.PI * 2);
          ctx.fillStyle = '#f59e0b';
          ctx.fill();
          ctx.strokeStyle = '#b45309';
          ctx.stroke();

          // Coin Collection
          const dist = Math.hypot(p.x + p.width / 2 - coin.x, p.y + p.height / 2 - coin.y);
          if (dist < coin.radius + p.width / 2) {
            coin.collected = true;
            state.score += 15;
            setRunnerScore(state.score);
          }
        }

        if (coin.x < -20) {
          state.coins.splice(i, 1);
        }
      }

      // Increase speed slightly
      if (state.frameCount % 300 === 0) {
        state.speed += 0.25;
      }

      animId = requestAnimationFrame(render);
    };

    render();

    return () => cancelAnimationFrame(animId);
  }, [selectedGame, isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div
        className={`w-full max-w-2xl rounded-2xl shadow-2xl flex flex-col overflow-hidden max-h-[92vh] border ${
          isDark ? 'bg-[#111b21] border-[#222e35] text-white' : 'bg-white border-gray-200 text-gray-900'
        }`}
      >
        {/* Header */}
        <div className={`p-4 flex items-center justify-between border-b ${isDark ? 'border-[#222e35] bg-[#202c33]' : 'border-gray-200 bg-gray-50'}`}>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold">
              <Gamepad2 className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-semibold text-base flex items-center gap-2">
                ZOLO PLAY Arcade
                <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 font-normal">
                  Multiplayer & Solo
                </span>
              </h2>
              <p className="text-xs opacity-60">Play instant games and challenge friends in chat</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-black/10 dark:hover:bg-white/10 transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Game Selector Bar */}
        <div className={`flex border-b overflow-x-auto ${isDark ? 'border-[#222e35] bg-[#111b21]' : 'border-gray-200 bg-white'}`}>
          <button
            onClick={() => setSelectedGame('kart')}
            className={`px-4 py-2.5 text-xs font-medium border-b-2 transition whitespace-nowrap ${
              selectedGame === 'kart'
                ? 'border-emerald-500 text-emerald-500 bg-emerald-500/5'
                : 'border-transparent opacity-70 hover:opacity-100'
            }`}
          >
            🏎️ Kart Grand Prix
          </button>
          <button
            onClick={() => setSelectedGame('pool')}
            className={`px-4 py-2.5 text-xs font-medium border-b-2 transition whitespace-nowrap ${
              selectedGame === 'pool'
                ? 'border-emerald-500 text-emerald-500 bg-emerald-500/5'
                : 'border-transparent opacity-70 hover:opacity-100'
            }`}
          >
            🎱 8-Ball Pool
          </button>
          <button
            onClick={() => setSelectedGame('tictactoe')}
            className={`px-4 py-2.5 text-xs font-medium border-b-2 transition whitespace-nowrap ${
              selectedGame === 'tictactoe'
                ? 'border-emerald-500 text-emerald-500 bg-emerald-500/5'
                : 'border-transparent opacity-70 hover:opacity-100'
            }`}
          >
            ⭕ Tic-Tac-Toe
          </button>
          <button
            onClick={() => setSelectedGame('hoops')}
            className={`px-4 py-2.5 text-xs font-medium border-b-2 transition whitespace-nowrap ${
              selectedGame === 'hoops'
                ? 'border-emerald-500 text-emerald-500 bg-emerald-500/5'
                : 'border-transparent opacity-70 hover:opacity-100'
            }`}
          >
            🏀 ZOLO Hoops
          </button>
          <button
            onClick={() => setSelectedGame('quiz')}
            className={`px-4 py-2.5 text-xs font-medium border-b-2 transition whitespace-nowrap ${
              selectedGame === 'quiz'
                ? 'border-emerald-500 text-emerald-500 bg-emerald-500/5'
                : 'border-transparent opacity-70 hover:opacity-100'
            }`}
          >
            🧠 ZOLO Trivia
          </button>
          <button
            onClick={() => setSelectedGame('runner')}
            className={`px-4 py-2.5 text-xs font-medium border-b-2 transition whitespace-nowrap ${
              selectedGame === 'runner'
                ? 'border-emerald-500 text-emerald-500 bg-emerald-500/5'
                : 'border-transparent opacity-70 hover:opacity-100'
            }`}
          >
            🏃 ZOLO Dash
          </button>
        </div>

        {/* Active Game Body */}
        <div className="p-5 flex-1 overflow-y-auto flex flex-col items-center justify-center">
          {/* KART GRAND PRIX */}
          {selectedGame === 'kart' && (
            <div className="w-full max-w-lg">
              <KartRacingGame
                theme={theme}
                onClose={onClose}
                onShareToChat={onShareToChat}
              />
            </div>
          )}

          {/* 8-BALL POOL */}
          {selectedGame === 'pool' && (
            <div className="w-full max-w-lg">
              <EightBallPoolGame
                theme={theme}
                onClose={onClose}
                onShareToChat={onShareToChat}
              />
            </div>
          )}

          {/* 1. TIC TAC TOE */}
          {selectedGame === 'tictactoe' && (
            <div className="w-full max-w-sm flex flex-col items-center space-y-4">
              <div className="flex items-center justify-between w-full text-xs">
                <div className="flex items-center gap-2">
                  <span className="opacity-70">Opponent:</span>
                  <button
                    onClick={() => {
                      setTttVsAi(!tttVsAi);
                      resetTtt();
                    }}
                    className="px-2.5 py-1 rounded-md bg-emerald-600/20 text-emerald-400 font-medium"
                  >
                    {tttVsAi ? '🤖 Smart AI' : '👥 2-Player Pass'}
                  </button>
                </div>
                <div className="flex items-center gap-3 font-semibold">
                  <span className="text-emerald-400">X: {tttScore.xWins}</span>
                  <span className="text-blue-400">O: {tttScore.oWins}</span>
                  <span className="opacity-50">T: {tttScore.draws}</span>
                </div>
              </div>

              {/* Status */}
              <div className="text-center font-medium text-sm">
                {tttWinner ? (
                  <span className="text-emerald-400">
                    {tttWinner === 'draw' ? "It's a Draw!" : `Player ${tttWinner} Wins! 🎉`}
                  </span>
                ) : (
                  <span className="opacity-80">Turn: Player {tttTurn}</span>
                )}
              </div>

              {/* 3x3 Board */}
              <div className="grid grid-cols-3 gap-2 p-3 rounded-2xl bg-black/20 border border-white/10 w-64 h-64">
                {tttBoard.map((val, idx) => {
                  const isWinningCell = tttWinningLine?.includes(idx);
                  return (
                    <button
                      key={idx}
                      onClick={() => handleTttClick(idx)}
                      disabled={!!val || !!tttWinner}
                      className={`rounded-xl flex items-center justify-center text-2xl font-bold transition ${
                        isDark ? 'bg-[#202c33] hover:bg-[#2a3942]' : 'bg-gray-100 hover:bg-gray-200'
                      } ${isWinningCell ? 'ring-2 ring-emerald-500 bg-emerald-500/20' : ''}`}
                    >
                      {val === 'X' && <XIcon className="w-8 h-8 text-emerald-400" />}
                      {val === 'O' && <Circle className="w-7 h-7 text-blue-400" />}
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center gap-2 w-full justify-center">
                <button
                  onClick={resetTtt}
                  className="px-4 py-2 rounded-xl border border-white/10 hover:bg-white/10 text-xs font-medium flex items-center gap-1.5"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  New Round
                </button>
                {onShareToChat && (
                  <button
                    onClick={() => {
                      const msg = `🎮 *ZOLO Tic-Tac-Toe Challenge*\nScore: X: ${tttScore.xWins} | O: ${tttScore.oWins} | Draws: ${tttScore.draws}\nWho wants to play next?`;
                      onShareToChat(msg);
                      onClose();
                    }}
                    className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium flex items-center gap-1.5 shadow"
                  >
                    <Send className="w-3.5 h-3.5" />
                    Share in Chat
                  </button>
                )}
              </div>
            </div>
          )}

          {/* 2. ZOLO HOOPS */}
          {selectedGame === 'hoops' && (
            <div className="flex flex-col items-center space-y-3 w-full">
              <div className="flex items-center justify-between w-full max-w-sm text-xs">
                <div className="flex items-center gap-1 font-semibold text-orange-400">
                  <Flame className="w-4 h-4" /> Score: {hoopsScore} (Streak: {hoopsStreak})
                </div>
                <div className="opacity-70">Time: {hoopsTimeLeft}s</div>
              </div>

              <div className="relative rounded-2xl overflow-hidden border border-white/10 shadow-lg cursor-crosshair">
                <canvas
                  ref={hoopsCanvasRef}
                  width={360}
                  height={380}
                  onMouseDown={handleHoopsMouseDown}
                  onMouseMove={handleHoopsMouseMove}
                  onMouseUp={handleHoopsMouseUp}
                  className="block bg-slate-900"
                />
                {hoopsGameOver && (
                  <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center gap-2">
                    <Trophy className="w-10 h-10 text-yellow-400 animate-bounce" />
                    <h3 className="font-bold text-lg">Time's Up!</h3>
                    <p className="text-xs opacity-80">Final Score: {hoopsScore} Points</p>
                    <button
                      onClick={() => {
                        setHoopsScore(0);
                        setHoopsStreak(0);
                        setHoopsTimeLeft(45);
                        setHoopsGameOver(false);
                      }}
                      className="mt-2 px-4 py-1.5 rounded-lg bg-orange-500 text-white text-xs font-semibold"
                    >
                      Play Again
                    </button>
                  </div>
                )}
              </div>

              <div className="text-[11px] opacity-60 text-center">
                Click & drag backwards from the ball to aim the trajectory arc, then release to shoot!
              </div>

              {onShareToChat && (
                <button
                  onClick={() => {
                    const msg = `🏀 *ZOLO Hoops High Score*\nI just scored *${hoopsScore} points* in ZOLO Arcade! Can you beat my score?`;
                    onShareToChat(msg);
                    onClose();
                  }}
                  className="px-4 py-2 rounded-xl bg-orange-600 hover:bg-orange-500 text-white text-xs font-medium flex items-center gap-1.5"
                >
                  <Send className="w-3.5 h-3.5" />
                  Share Score in Chat
                </button>
              )}
            </div>
          )}

          {/* 3. ZOLO QUIZ */}
          {selectedGame === 'quiz' && (
            <div className="w-full max-w-md flex flex-col space-y-4">
              {!quizCompleted ? (
                <>
                  <div className="flex items-center justify-between text-xs">
                    <span className="opacity-60">
                      Question {quizIndex + 1} of {QUIZ_QUESTIONS.length}
                    </span>
                    <span className="font-semibold text-emerald-400">Score: {quizScore}</span>
                  </div>

                  <div className={`p-4 rounded-xl border ${isDark ? 'bg-[#182229] border-[#222e35]' : 'bg-gray-50 border-gray-200'}`}>
                    <h3 className="font-semibold text-sm mb-4 leading-relaxed">
                      {QUIZ_QUESTIONS[quizIndex].question}
                    </h3>

                    <div className="space-y-2">
                      {QUIZ_QUESTIONS[quizIndex].options.map((opt, idx) => {
                        const isCorrect = idx === QUIZ_QUESTIONS[quizIndex].answer;
                        const isSelected = quizSelectedOption === idx;

                        let style = isDark ? 'bg-[#202c33] border-[#2a3942]' : 'bg-white border-gray-300';
                        if (quizAnswered) {
                          if (isCorrect) style = 'bg-emerald-600 text-white border-emerald-600';
                          else if (isSelected) style = 'bg-red-600 text-white border-red-600';
                        }

                        return (
                          <button
                            key={idx}
                            onClick={() => handleQuizSelect(idx)}
                            disabled={quizAnswered}
                            className={`w-full p-3 rounded-xl border text-xs font-medium text-left flex items-center justify-between transition ${style}`}
                          >
                            <span>{opt}</span>
                            {quizAnswered && isCorrect && <Check className="w-4 h-4 text-white" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {quizAnswered && (
                    <div className="space-y-3">
                      <p className="text-xs opacity-80 italic">
                        {QUIZ_QUESTIONS[quizIndex].explanation}
                      </p>
                      <div className="flex justify-end">
                        <button
                          onClick={handleNextQuizQuestion}
                          className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium"
                        >
                          {quizIndex + 1 < QUIZ_QUESTIONS.length ? 'Next Question →' : 'View Results'}
                        </button>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="text-center py-6 space-y-3">
                  <Award className="w-12 h-12 text-yellow-400 mx-auto animate-bounce" />
                  <h3 className="text-lg font-bold">Quiz Completed!</h3>
                  <p className="text-sm opacity-80">You scored {quizScore} out of 100 points!</p>
                  <div className="flex items-center justify-center gap-2 pt-2">
                    <button
                      onClick={resetQuiz}
                      className="px-4 py-2 rounded-lg border border-white/10 hover:bg-white/10 text-xs font-medium"
                    >
                      Play Again
                    </button>
                    {onShareToChat && (
                      <button
                        onClick={() => {
                          const msg = `🧠 *ZOLO Trivia Challenge*\nI scored *${quizScore}/100* on the ZOLO Quiz! Can you beat my score?`;
                          onShareToChat(msg);
                          onClose();
                        }}
                        className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium flex items-center gap-1.5"
                      >
                        <Send className="w-3.5 h-3.5" />
                        Share in Chat
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 4. ZOLO DASH */}
          {selectedGame === 'runner' && (
            <div className="flex flex-col items-center space-y-3 w-full">
              <div className="flex items-center justify-between w-full max-w-sm text-xs">
                <span className="font-semibold text-emerald-400">Score: {runnerScore}</span>
                <span className="opacity-70">Tap Jump button or click canvas</span>
              </div>

              <div
                className="relative rounded-2xl overflow-hidden border border-white/10 shadow-lg cursor-pointer"
                onClick={jumpRunner}
              >
                <canvas ref={runnerCanvasRef} width={380} height={220} className="block" />
                {runnerGameOver && (
                  <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center gap-2">
                    <h3 className="font-bold text-base text-red-400">Game Over!</h3>
                    <p className="text-xs opacity-80">Score: {runnerScore}</p>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        runnerStateRef.current.active = true;
                        runnerStateRef.current.score = 0;
                        runnerStateRef.current.obstacles = [];
                        runnerStateRef.current.coins = [];
                        setRunnerGameOver(false);
                        setRunnerScore(0);
                      }}
                      className="mt-1 px-4 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold"
                    >
                      Try Again
                    </button>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={jumpRunner}
                  className="px-6 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 shadow"
                >
                  <ArrowUp className="w-4 h-4" />
                  JUMP
                </button>
                {onShareToChat && (
                  <button
                    onClick={() => {
                      const msg = `🏃 *ZOLO Dash Runner*\nI jumped & dodged to a high score of *${runnerScore}* in ZOLO Arcade! Try to beat it!`;
                      onShareToChat(msg);
                      onClose();
                    }}
                    className="px-4 py-2 rounded-xl border border-white/10 hover:bg-white/10 text-xs font-medium flex items-center gap-1.5"
                  >
                    <Send className="w-3.5 h-3.5" />
                    Share in Chat
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
