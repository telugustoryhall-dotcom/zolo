import React, { useRef, useEffect, useState } from 'react';
import { Play, RotateCcw, Trophy, Send, Users, User, Circle } from 'lucide-react';

interface EightBallPoolGameProps {
  onShareToChat?: (text: string) => void;
  onClose: () => void;
  theme: 'dark' | 'light';
}

interface Ball {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
  isStripe: boolean;
  potted: boolean;
  number: number;
}

const BALL_COLORS = [
  '#ffffff', // 0: Cue ball
  '#facc15', // 1: Solid yellow
  '#2563eb', // 2: Solid blue
  '#dc2626', // 3: Solid red
  '#7c3aed', // 4: Solid purple
  '#ea580c', // 5: Solid orange
  '#16a34a', // 6: Solid green
  '#7f1d1d', // 7: Solid maroon
  '#0f172a', // 8: Eight ball (black)
  '#facc15', // 9: Stripe yellow
  '#2563eb', // 10: Stripe blue
  '#dc2626', // 11: Stripe red
  '#7c3aed', // 12: Stripe purple
  '#ea580c', // 13: Stripe orange
  '#16a34a', // 14: Stripe green
  '#7f1d1d', // 15: Stripe maroon
];

export const EightBallPoolGame: React.FC<EightBallPoolGameProps> = ({
  onShareToChat,
  onClose,
  theme,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [power, setPower] = useState(55); // 10 to 100
  const [turn, setTurn] = useState<'player1' | 'player2'>('player1');
  const [mode, setMode] = useState<'pass_play' | 'practice'>('pass_play');
  const [p1Potted, setP1Potted] = useState<number[]>([]);
  const [p2Potted, setP2Potted] = useState<number[]>([]);
  const [statusMessage, setStatusMessage] = useState('Aim cue stick & hit the cue ball!');
  const [ballsMoving, setBallsMoving] = useState(false);

  const simRef = useRef({
    balls: [] as Ball[],
    cueAngle: 0, // radians
    isAiming: false,
    dragStart: { x: 0, y: 0 },
    currentMouse: { x: 0, y: 0 },
    pockets: [] as Array<{ x: number; y: number; r: number }>,
    table: {
      left: 36,
      top: 36,
      right: 504,
      bottom: 244,
      width: 468,
      height: 208,
    },
    friction: 0.984,
  });

  const initTable = () => {
    const table = simRef.current.table;
    const r = 9;

    // Define 6 pockets
    simRef.current.pockets = [
      { x: table.left + 4, y: table.top + 4, r: 16 }, // Top Left
      { x: (table.left + table.right) / 2, y: table.top + 2, r: 14 }, // Top Center
      { x: table.right - 4, y: table.top + 4, r: 16 }, // Top Right
      { x: table.left + 4, y: table.bottom - 4, r: 16 }, // Bottom Left
      { x: (table.left + table.right) / 2, y: table.bottom - 2, r: 14 }, // Bottom Center
      { x: table.right - 4, y: table.bottom - 4, r: 16 }, // Bottom Right
    ];

    const balls: Ball[] = [];

    // Cue Ball (id 0)
    balls.push({
      id: 0,
      number: 0,
      x: table.left + table.width * 0.25,
      y: table.top + table.height * 0.5,
      vx: 0,
      vy: 0,
      radius: r,
      color: '#ffffff',
      isStripe: false,
      potted: false,
    });

    // 15 Object balls arranged in standard triangular rack
    const rackStartX = table.left + table.width * 0.7;
    const rackCenterY = table.top + table.height * 0.5;
    let bIndex = 1;

    for (let col = 0; col < 5; col++) {
      const colX = rackStartX + col * (r * 1.732);
      const rowStart = rackCenterY - col * r;

      for (let row = 0; row <= col; row++) {
        const colY = rowStart + row * (r * 2);
        const ballNum = bIndex === 5 ? 8 : bIndex; // Put 8-ball in center
        balls.push({
          id: ballNum,
          number: ballNum,
          x: colX,
          y: colY,
          vx: 0,
          vy: 0,
          radius: r,
          color: BALL_COLORS[ballNum],
          isStripe: ballNum > 8,
          potted: false,
        });
        bIndex++;
      }
    }

    simRef.current.balls = balls;
    setP1Potted([]);
    setP2Potted([]);
    setTurn('player1');
    setStatusMessage('Break the rack! Aim with mouse/touch & launch!');
  };

  useEffect(() => {
    initTable();
  }, []);

  // Main 60fps physics simulation loop
  useEffect(() => {
    let animId: number;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { table, pockets } = simRef.current;

    const loop = () => {
      const sim = simRef.current;
      const balls = sim.balls;

      let anyMoving = false;

      // 1. Move balls & Cushion collisions
      for (const b of balls) {
        if (b.potted) continue;

        b.x += b.vx;
        b.y += b.vy;
        b.vx *= sim.friction;
        b.vy *= sim.friction;

        if (Math.abs(b.vx) > 0.05 || Math.abs(b.vy) > 0.05) {
          anyMoving = true;
        } else {
          b.vx = 0;
          b.vy = 0;
        }

        // Cushion bounce
        if (b.x - b.radius < table.left) {
          b.x = table.left + b.radius;
          b.vx = -b.vx * 0.85;
        }
        if (b.x + b.radius > table.right) {
          b.x = table.right - b.radius;
          b.vx = -b.vx * 0.85;
        }
        if (b.y - b.radius < table.top) {
          b.y = table.top + b.radius;
          b.vy = -b.vy * 0.85;
        }
        if (b.y + b.radius > table.bottom) {
          b.y = table.bottom - b.radius;
          b.vy = -b.vy * 0.85;
        }

        // Pocket check
        for (const p of pockets) {
          const dx = b.x - p.x;
          const dy = b.y - p.y;
          if (Math.hypot(dx, dy) < p.r) {
            b.potted = true;
            b.vx = 0;
            b.vy = 0;

            if (b.id === 0) {
              // Scratch!
              setStatusMessage('⚠️ Scratch! Cue ball potted. Resetting ball in hand.');
              setTimeout(() => {
                b.x = table.left + table.width * 0.25;
                b.y = table.top + table.height * 0.5;
                b.potted = false;
              }, 600);
            } else if (b.id === 8) {
              setStatusMessage('🎱 8-Ball Potted! Game Over!');
            } else {
              setStatusMessage(`Ball #${b.number} potted!`);
              if (turn === 'player1') {
                setP1Potted((prev) => [...prev, b.number]);
              } else {
                setP2Potted((prev) => [...prev, b.number]);
              }
            }
          }
        }
      }

      setBallsMoving(anyMoving);

      // 2. Ball-to-Ball Elastic Collisions
      for (let i = 0; i < balls.length; i++) {
        for (let j = i + 1; j < balls.length; j++) {
          const b1 = balls[i];
          const b2 = balls[j];
          if (b1.potted || b2.potted) continue;

          const dx = b2.x - b1.x;
          const dy = b2.y - b1.y;
          const dist = Math.hypot(dx, dy);

          if (dist < b1.radius + b2.radius) {
            // Overlap separation
            const overlap = b1.radius + b2.radius - dist;
            const nx = dx / dist;
            const ny = dy / dist;

            b1.x -= nx * overlap * 0.5;
            b1.y -= ny * overlap * 0.5;
            b2.x += nx * overlap * 0.5;
            b2.y += ny * overlap * 0.5;

            // Elastic momentum transfer along normal
            const kx = b1.vx - b2.vx;
            const ky = b1.vy - b2.vy;
            const p = 2 * (nx * kx + ny * ky) / 2;

            b1.vx -= p * nx;
            b1.vy -= p * ny;
            b2.vx += p * nx;
            b2.vy += p * ny;
          }
        }
      }

      // -------------------------------------------------------------
      // RENDERING (Classic Green Felt Table)
      // -------------------------------------------------------------
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Wooden rail border
      ctx.fillStyle = '#78350f';
      ctx.beginPath();
      ctx.roundRect(14, 14, canvas.width - 28, canvas.height - 28, 16);
      ctx.fill();

      // Outer rail bevel
      ctx.strokeStyle = '#451a03';
      ctx.lineWidth = 4;
      ctx.stroke();

      // Green felt playfield
      ctx.fillStyle = '#065f46';
      ctx.fillRect(table.left, table.top, table.width, table.height);

      // Head string guideline (dotted)
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(table.left + table.width * 0.25, table.top);
      ctx.lineTo(table.left + table.width * 0.25, table.bottom);
      ctx.stroke();
      ctx.setLineDash([]);

      // Pockets (Dark holes with rim shadows)
      for (const p of pockets) {
        ctx.fillStyle = '#020617';
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#334155';
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      // Draw Balls
      for (const b of balls) {
        if (b.potted) continue;

        // Shadow
        ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
        ctx.beginPath();
        ctx.arc(b.x + 2, b.y + 2, b.radius, 0, Math.PI * 2);
        ctx.fill();

        // Ball Body
        ctx.fillStyle = b.color;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
        ctx.fill();

        // If Stripe, draw white center ring
        if (b.isStripe) {
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(b.x, b.y, b.radius * 0.65, 0, Math.PI * 2);
          ctx.fill();
        }

        // White number circle
        if (b.id !== 0) {
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.arc(b.x, b.y, b.radius * 0.45, 0, Math.PI * 2);
          ctx.fill();

          ctx.fillStyle = '#000000';
          ctx.font = 'bold 7px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(String(b.number), b.x, b.y + 0.5);
        } else {
          // Specular highlight on cue ball
          ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
          ctx.beginPath();
          ctx.arc(b.x - 2, b.y - 2, 2.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Cue Aiming Trajectory Guide (when not moving)
      const cueBall = balls[0];
      if (!anyMoving && cueBall && !cueBall.potted) {
        const aimDist = 180;
        const targetX = cueBall.x + Math.cos(sim.cueAngle) * aimDist;
        const targetY = cueBall.y + Math.sin(sim.cueAngle) * aimDist;

        // Dotted aim line
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(cueBall.x, cueBall.y);
        ctx.lineTo(targetX, targetY);
        ctx.stroke();
        ctx.setLineDash([]);

        // Cue Stick
        const cueLength = 110;
        const cueOffset = 22 + (power / 100) * 16;
        const cueStartX = cueBall.x - Math.cos(sim.cueAngle) * (cueOffset + cueLength);
        const cueStartY = cueBall.y - Math.sin(sim.cueAngle) * (cueOffset + cueLength);
        const cueEndX = cueBall.x - Math.cos(sim.cueAngle) * cueOffset;
        const cueEndY = cueBall.y - Math.sin(sim.cueAngle) * cueOffset;

        ctx.strokeStyle = '#d97706';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(cueStartX, cueStartY);
        ctx.lineTo(cueEndX, cueEndY);
        ctx.stroke();

        // Cue Tip
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(cueEndX - Math.cos(sim.cueAngle) * 4, cueEndY - Math.sin(sim.cueAngle) * 4);
        ctx.lineTo(cueEndX, cueEndY);
        ctx.stroke();
      }

      animId = requestAnimationFrame(loop);
    };

    animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animId);
  }, [turn, power]);

  // Handle aiming by moving mouse / dragging on canvas
  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * canvas.width;
    const y = ((e.clientY - rect.top) / rect.height) * canvas.height;

    const cueBall = simRef.current.balls[0];
    if (cueBall && !ballsMoving) {
      const angle = Math.atan2(y - cueBall.y, x - cueBall.x);
      simRef.current.cueAngle = angle;
    }
  };

  const handleShoot = () => {
    const cueBall = simRef.current.balls[0];
    if (!cueBall || cueBall.potted || ballsMoving) return;

    const shotForce = (power / 100) * 16;
    cueBall.vx = Math.cos(simRef.current.cueAngle) * shotForce;
    cueBall.vy = Math.sin(simRef.current.cueAngle) * shotForce;

    // Switch turns in Pass & Play mode
    if (mode === 'pass_play') {
      setTurn((t) => (t === 'player1' ? 'player2' : 'player1'));
    }
  };

  return (
    <div className="flex flex-col items-center p-3 gap-3">
      {/* Top Status & Turn Bar */}
      <div className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-slate-900 text-white border border-slate-800 text-xs">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span
              className={`px-2.5 py-0.5 rounded-full font-bold text-[11px] ${
                turn === 'player1'
                  ? 'bg-emerald-500 text-white'
                  : 'bg-slate-800 text-slate-400'
              }`}
            >
              Player 1 ({p1Potted.length})
            </span>
            <span
              className={`px-2.5 py-0.5 rounded-full font-bold text-[11px] ${
                turn === 'player2'
                  ? 'bg-blue-500 text-white'
                  : 'bg-slate-800 text-slate-400'
              }`}
            >
              Player 2 ({p2Potted.length})
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setMode(mode === 'pass_play' ? 'practice' : 'pass_play')}
            className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-[11px] flex items-center gap-1"
          >
            <Users className="w-3.5 h-3.5" />
            <span>{mode === 'pass_play' ? 'Pass & Play' : 'Solo Practice'}</span>
          </button>
          <button
            onClick={initTable}
            className="p-1 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white"
            title="Reset Rack"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Canvas Billiard Table */}
      <div className="relative rounded-2xl overflow-hidden border border-slate-700 shadow-2xl bg-black">
        <canvas
          ref={canvasRef}
          width={540}
          height={280}
          onPointerMove={handlePointerMove}
          className="w-full max-w-[540px] block cursor-crosshair touch-none"
        />
      </div>

      {/* Status banner */}
      <div className="text-xs text-slate-400 text-center font-medium">
        {statusMessage}
      </div>

      {/* Shooting Controls & Power Slider */}
      <div className="w-full max-w-[540px] flex items-center justify-between gap-4 px-2">
        <div className="flex-1 flex items-center gap-2">
          <span className="text-xs font-semibold text-slate-300 shrink-0">Cue Power:</span>
          <input
            type="range"
            min={15}
            max={100}
            value={power}
            onChange={(e) => setPower(Number(e.target.value))}
            className="flex-1 accent-[#00a884] cursor-pointer"
          />
          <span className="text-xs font-mono font-bold text-emerald-400 w-9 text-right">
            {power}%
          </span>
        </div>

        <button
          onClick={handleShoot}
          disabled={ballsMoving}
          className="px-6 py-2.5 rounded-full bg-[#00a884] hover:bg-[#008f72] text-white font-bold text-xs shadow-md transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5 shrink-0"
        >
          <Play className="w-4 h-4 fill-current" />
          <span>STRIKE</span>
        </button>

        {onShareToChat && (
          <button
            onClick={() => {
              const msg = `🎱 *ZOLO 8-Ball Pool Challenge*\nI challenge you to a 2-Player 8-Ball match in ZOLO PLAY Arcade! Open ZOLO PLAY to accept the match!`;
              onShareToChat(msg);
              onClose();
            }}
            className="px-4 py-2.5 rounded-xl border border-white/10 hover:bg-white/10 text-white text-xs font-semibold flex items-center gap-1.5 shrink-0 shadow"
          >
            <Send className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Invite in Chat</span>
          </button>
        )}
      </div>
    </div>
  );
};
