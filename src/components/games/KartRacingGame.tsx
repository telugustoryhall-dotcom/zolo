import React, { useRef, useEffect, useState, useCallback } from 'react';
import { Play, RotateCcw, Trophy, Send, Zap, ChevronLeft, ChevronRight, ArrowUp, ArrowDown } from 'lucide-react';

interface KartRacingGameProps {
  onShareToChat?: (text: string) => void;
  onClose: () => void;
  theme: 'dark' | 'light';
}

interface RivalKart {
  x: number; // offset from center (-1 to 1)
  z: number; // distance down the track (0 to 1000)
  speed: number;
  color: string;
  name: string;
}

export const KartRacingGame: React.FC<KartRacingGameProps> = ({
  onShareToChat,
  onClose,
  theme,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const [gameState, setGameState] = useState<'idle' | 'racing' | 'finished'>('idle');
  const [lap, setLap] = useState(1);
  const totalLaps = 3;
  const [currentSpeed, setCurrentSpeed] = useState(0);
  const [position, setPosition] = useState(4); // 1st to 4th
  const [nitro, setNitro] = useState(100);
  const [raceTime, setRaceTime] = useState(0);
  const [bestLapTime, setBestLapTime] = useState<number | null>(null);

  // Mutable race simulation state stored in ref for 60fps loop
  const simRef = useRef({
    playerX: 0, // -1.2 to 1.2 (road center is 0)
    playerZ: 0, // distance traveled
    speed: 0,
    maxSpeed: 240,
    accel: 0.8,
    braking: 1.6,
    friction: 0.985,
    curve: 0,
    targetCurve: 0,
    nitroActive: false,
    lapCount: 1,
    lapDistance: 12000,
    lapStartTime: 0,
    rivals: [
      { x: -0.4, z: 800, speed: 180, color: '#ef4444', name: 'Blaze' },
      { x: 0.3, z: 1600, speed: 195, color: '#3b82f6', name: 'Vortex' },
      { x: 0.0, z: 2400, speed: 210, color: '#eab308', name: 'Apex' },
    ] as RivalKart[],
    keys: {
      left: false,
      right: false,
      up: false,
      down: false,
      nitro: false,
    },
    nitroGauge: 100,
    startTime: 0,
    finished: false,
  });

  // Handle keyboard
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const k = simRef.current.keys;
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') k.left = true;
      if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') k.right = true;
      if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') k.up = true;
      if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') k.down = true;
      if (e.key === ' ' || e.key === 'Shift') k.nitro = true;
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const k = simRef.current.keys;
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') k.left = false;
      if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') k.right = false;
      if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') k.up = false;
      if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') k.down = false;
      if (e.key === ' ' || e.key === 'Shift') k.nitro = false;
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  const startRace = () => {
    simRef.current = {
      playerX: 0,
      playerZ: 0,
      speed: 0,
      maxSpeed: 240,
      accel: 0.8,
      braking: 1.6,
      friction: 0.985,
      curve: 0,
      targetCurve: 0,
      nitroActive: false,
      lapCount: 1,
      lapDistance: 12000,
      lapStartTime: Date.now(),
      rivals: [
        { x: -0.4, z: 600, speed: 180, color: '#ef4444', name: 'Blaze' },
        { x: 0.3, z: 1200, speed: 195, color: '#3b82f6', name: 'Vortex' },
        { x: 0.0, z: 1800, speed: 210, color: '#eab308', name: 'Apex' },
      ],
      keys: { left: false, right: false, up: false, down: false, nitro: false },
      nitroGauge: 100,
      startTime: Date.now(),
      finished: false,
    };
    setLap(1);
    setPosition(4);
    setNitro(100);
    setGameState('racing');
  };

  // Main 60fps game animation loop
  useEffect(() => {
    if (gameState !== 'racing') return;

    let animId: number;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const horizon = height * 0.44;

    const loop = () => {
      const sim = simRef.current;
      const now = Date.now();
      setRaceTime(Math.floor((now - sim.startTime) / 1000));

      // 1. Controls & Acceleration Physics
      const isBoosting = sim.keys.nitro && sim.nitroGauge > 5;
      sim.nitroActive = isBoosting;

      const topSpeed = isBoosting ? sim.maxSpeed * 1.35 : sim.maxSpeed;
      if (isBoosting) {
        sim.nitroGauge = Math.max(0, sim.nitroGauge - 0.7);
      } else {
        sim.nitroGauge = Math.min(100, sim.nitroGauge + 0.15);
      }
      setNitro(Math.floor(sim.nitroGauge));

      if (sim.keys.up) {
        sim.speed = Math.min(topSpeed, sim.speed + (isBoosting ? 2.2 : sim.accel));
      } else if (sim.keys.down) {
        sim.speed = Math.max(0, sim.speed - sim.braking);
      } else {
        sim.speed = Math.max(0, sim.speed * sim.friction);
      }

      // Off-road penalty
      if (Math.abs(sim.playerX) > 0.95) {
        sim.speed *= 0.96;
      }

      // Steering
      const steerFactor = (sim.speed / topSpeed) * 0.038;
      if (sim.keys.left) sim.playerX -= steerFactor;
      if (sim.keys.right) sim.playerX += steerFactor;
      sim.playerX = Math.max(-1.3, Math.min(1.3, sim.playerX));

      // Road Curve dynamics
      const trackProgress = sim.playerZ % 6000;
      if (trackProgress < 1500) sim.targetCurve = 0;
      else if (trackProgress < 3000) sim.targetCurve = 1.2;
      else if (trackProgress < 4500) sim.targetCurve = -1.2;
      else sim.targetCurve = 0.5;

      sim.curve += (sim.targetCurve - sim.curve) * 0.03;
      sim.playerX -= sim.curve * (sim.speed / topSpeed) * 0.02;

      // Distance progressed
      sim.playerZ += sim.speed * 0.12;
      setCurrentSpeed(Math.floor(sim.speed));

      // Lap tracking
      const currentLapIndex = Math.floor(sim.playerZ / sim.lapDistance) + 1;
      if (currentLapIndex !== sim.lapCount && currentLapIndex <= totalLaps) {
        sim.lapCount = currentLapIndex;
        setLap(currentLapIndex);
      } else if (currentLapIndex > totalLaps && !sim.finished) {
        sim.finished = true;
        setGameState('finished');
        return;
      }

      // Rivals physics & position calculate
      let currentRank = 1;
      for (const r of sim.rivals) {
        r.z += r.speed * 0.11;
        // Keep rivals looping track
        if (r.z < sim.playerZ - 1000) r.z += sim.lapDistance;
        if (r.z > sim.playerZ) currentRank++;
      }
      setPosition(currentRank);

      // -------------------------------------------------------------
      // RENDERING (Pseudo-3D Track Perspective)
      // -------------------------------------------------------------
      ctx.clearRect(0, 0, width, height);

      // Sky gradient
      const skyGrad = ctx.createLinearGradient(0, 0, 0, horizon);
      skyGrad.addColorStop(0, '#0f172a');
      skyGrad.addColorStop(0.6, '#1e1b4b');
      skyGrad.addColorStop(1, '#db2777');
      ctx.fillStyle = skyGrad;
      ctx.fillRect(0, 0, width, horizon);

      // Distant mountains / horizon silhouette
      ctx.fillStyle = '#090d16';
      ctx.beginPath();
      ctx.moveTo(0, horizon);
      for (let x = 0; x <= width; x += 40) {
        const peak = horizon - Math.sin((x + sim.playerZ * 0.05) * 0.02) * 16 - 8;
        ctx.lineTo(x, peak);
      }
      ctx.lineTo(width, horizon);
      ctx.fill();

      // Sun
      ctx.fillStyle = '#fbbf24';
      ctx.beginPath();
      ctx.arc(width * 0.75, horizon - 20, 16, 0, Math.PI * 2);
      ctx.fill();

      // Render 3D Road scanlines
      const lines = 80;
      for (let i = 0; i < lines; i++) {
        const p = i / lines;
        const y = horizon + Math.pow(p, 1.8) * (height - horizon);
        const nextY = horizon + Math.pow((i + 1) / lines, 1.8) * (height - horizon);
        const scanH = Math.max(1, nextY - y);

        // Perspective road width
        const roadW = width * (0.12 + Math.pow(p, 2.2) * 0.78);
        const curveOffset = Math.sin(p * Math.PI) * sim.curve * 120 * p;
        const roadX = width / 2 - sim.playerX * roadW * 0.5 + curveOffset;

        // Alternating grass & road colors
        const zSegment = Math.floor((sim.playerZ + (lines - i) * 60) / 120);
        const isAlternate = zSegment % 2 === 0;

        // Grass
        ctx.fillStyle = isAlternate ? '#14532d' : '#166534';
        ctx.fillRect(0, y, width, scanH);

        // Kerbs (Red & White rumblestrips)
        const kerbW = roadW * 0.08;
        ctx.fillStyle = isAlternate ? '#ef4444' : '#ffffff';
        ctx.fillRect(roadX - roadW / 2 - kerbW, y, kerbW, scanH);
        ctx.fillRect(roadX + roadW / 2, y, kerbW, scanH);

        // Asphalt Road
        ctx.fillStyle = isAlternate ? '#334155' : '#1e293b';
        ctx.fillRect(roadX - roadW / 2, y, roadW, scanH);

        // Dashed Centerline
        if (isAlternate) {
          ctx.fillStyle = '#f8fafc';
          const lineW = Math.max(2, roadW * 0.025);
          ctx.fillRect(roadX - lineW / 2, y, lineW, scanH);
        }
      }

      // Draw Rivals ahead on track
      for (const r of sim.rivals) {
        const relZ = r.z - sim.playerZ;
        if (relZ > 50 && relZ < 2500) {
          const depth = 1 - relZ / 2500;
          const rY = horizon + Math.pow(depth, 1.8) * (height - horizon);
          const rRoadW = width * (0.12 + Math.pow(depth, 2.2) * 0.78);
          const rX = width / 2 - (sim.playerX - r.x) * rRoadW * 0.5;
          const kartSize = 14 + depth * 32;

          ctx.fillStyle = r.color;
          ctx.beginPath();
          ctx.roundRect(rX - kartSize / 2, rY - kartSize, kartSize, kartSize * 0.75, 4);
          ctx.fill();

          // Wheels
          ctx.fillStyle = '#0f172a';
          ctx.fillRect(rX - kartSize / 2 - 3, rY - kartSize * 0.4, 4, kartSize * 0.4);
          ctx.fillRect(rX + kartSize / 2 - 1, rY - kartSize * 0.4, 4, kartSize * 0.4);

          // Rival nametag
          ctx.fillStyle = '#ffffff';
          ctx.font = '9px sans-serif';
          ctx.textAlign = 'center';
          ctx.fillText(r.name, rX, rY - kartSize - 4);
        }
      }

      // Draw Player Kart (bottom center)
      const pKartW = 68;
      const pKartH = 46;
      const pKartX = width / 2;
      const pKartY = height - 18;

      // Tire skid / Nitro boost particles
      if (sim.nitroActive) {
        ctx.fillStyle = '#38bdf8';
        ctx.beginPath();
        ctx.arc(pKartX - 18, pKartY - 4, 8 + Math.random() * 6, 0, Math.PI * 2);
        ctx.arc(pKartX + 18, pKartY - 4, 8 + Math.random() * 6, 0, Math.PI * 2);
        ctx.fill();
      }

      // Kart Body
      ctx.fillStyle = '#10b981'; // ZOLO emerald brand
      ctx.beginPath();
      ctx.roundRect(pKartX - pKartW / 2, pKartY - pKartH, pKartW, pKartH * 0.8, 8);
      ctx.fill();

      // Spoiler
      ctx.fillStyle = '#065f46';
      ctx.fillRect(pKartX - pKartW / 2 + 4, pKartY - pKartH - 6, pKartW - 8, 5);

      // Cockpit & Driver Helmet
      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.ellipse(pKartX, pKartY - pKartH * 0.55, 12, 10, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fbbf24'; // helmet
      ctx.beginPath();
      ctx.arc(pKartX, pKartY - pKartH * 0.58, 7, 0, Math.PI * 2);
      ctx.fill();

      // Exhaust Pipes & Rear Lights
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(pKartX - pKartW / 2 + 6, pKartY - 10, 8, 4);
      ctx.fillRect(pKartX + pKartW / 2 - 14, pKartY - 10, 8, 4);

      // Wheels
      ctx.fillStyle = '#020617';
      ctx.fillRect(pKartX - pKartW / 2 - 6, pKartY - pKartH * 0.6, 8, 22);
      ctx.fillRect(pKartX + pKartW / 2 - 2, pKartY - pKartH * 0.6, 8, 22);

      animId = requestAnimationFrame(loop);
    };

    animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animId);
  }, [gameState]);

  const formatRaceTime = (s: number) => {
    const m = Math.floor(s / 60);
    const secs = s % 60;
    return `${m}:${secs < 10 ? '0' : ''}${secs}`;
  };

  return (
    <div className="flex flex-col items-center p-3 gap-3">
      {/* HUD Header */}
      <div className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-slate-900 text-white border border-slate-800 text-xs font-semibold">
        <div className="flex items-center gap-3">
          <span className="text-amber-400 font-bold">
            LAP {lap}/{totalLaps}
          </span>
          <span className="text-slate-400">POS: <strong className="text-white text-sm">{position}</strong>/4</span>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5">
            <Zap className={`w-3.5 h-3.5 ${nitro > 20 ? 'text-cyan-400' : 'text-slate-500'}`} />
            <div className="w-20 h-2 bg-slate-700 rounded-full overflow-hidden">
              <div
                style={{ width: `${nitro}%` }}
                className="h-full bg-cyan-400 transition-all duration-75"
              />
            </div>
          </div>
          <span className="tabular-nums font-mono text-emerald-400 text-sm">{currentSpeed} KM/H</span>
        </div>
      </div>

      {/* Canvas Arcade Screen */}
      <div className="relative rounded-2xl overflow-hidden border border-slate-700 shadow-2xl bg-black">
        <canvas
          ref={canvasRef}
          width={540}
          height={300}
          className="w-full max-w-[540px] block"
        />

        {gameState === 'idle' && (
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center text-white">
            <div className="w-16 h-16 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mb-3">
              <Trophy className="w-8 h-8" />
            </div>
            <h3 className="text-xl font-bold tracking-tight mb-1">ZOLO Kart Grand Prix</h3>
            <p className="text-xs text-slate-300 max-w-xs mb-4">
              3-Lap High Speed Racing! Steer through sharp curves, overtake rival karts & deploy nitro boost!
            </p>
            <button
              onClick={startRace}
              className="px-6 py-2.5 rounded-full bg-[#00a884] hover:bg-[#008f72] text-white font-bold text-xs shadow-lg transition-transform active:scale-95 flex items-center gap-2"
            >
              <Play className="w-4 h-4 fill-current" />
              <span>START RACE</span>
            </button>
            <div className="text-[11px] text-slate-400 mt-4">
              Desktop: Arrow Keys / WASD + Space for Nitro • Mobile: On-screen buttons below
            </div>
          </div>
        )}

        {gameState === 'finished' && (
          <div className="absolute inset-0 bg-black/85 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center text-white animate-in zoom-in-95">
            <Trophy className="w-14 h-14 text-amber-400 mb-2 animate-bounce" />
            <h3 className="text-2xl font-black mb-1">
              {position === 1 ? '🏆 1ST PLACE WINNER!' : `FINISHED POSITION: ${position}/4`}
            </h3>
            <p className="text-xs text-slate-300 mb-4">
              Total Race Time: <strong className="text-emerald-400 font-mono text-sm">{formatRaceTime(raceTime)}</strong>
            </p>
            <div className="flex items-center gap-3">
              <button
                onClick={startRace}
                className="px-5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold flex items-center gap-1.5"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Race Again</span>
              </button>
              {onShareToChat && (
                <button
                  onClick={() => {
                    const msg = `🏎️ *ZOLO Kart Grand Prix Result*\nI completed the 3-Lap Grand Prix in *${formatRaceTime(
                      raceTime
                    )}* taking position *#${position}*! Can you beat my lap time?`;
                    onShareToChat(msg);
                    onClose();
                  }}
                  className="px-5 py-2 rounded-xl bg-[#00a884] hover:bg-[#008f72] text-white text-xs font-bold flex items-center gap-1.5 shadow"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Share in Chat</span>
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* On-Screen Touch Controls (Mobile Friendly) */}
      <div className="w-full max-w-[540px] flex items-center justify-between px-2 pt-1">
        {/* Left / Right Steering */}
        <div className="flex items-center gap-2">
          <button
            onTouchStart={() => (simRef.current.keys.left = true)}
            onTouchEnd={() => (simRef.current.keys.left = false)}
            onMouseDown={() => (simRef.current.keys.left = true)}
            onMouseUp={() => (simRef.current.keys.left = false)}
            className="w-12 h-12 rounded-xl bg-slate-800 hover:bg-slate-700 text-white flex items-center justify-center active:scale-95 shadow border border-slate-700"
            aria-label="Steer Left"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
          <button
            onTouchStart={() => (simRef.current.keys.right = true)}
            onTouchEnd={() => (simRef.current.keys.right = false)}
            onMouseDown={() => (simRef.current.keys.right = true)}
            onMouseUp={() => (simRef.current.keys.right = false)}
            className="w-12 h-12 rounded-xl bg-slate-800 hover:bg-slate-700 text-white flex items-center justify-center active:scale-95 shadow border border-slate-700"
            aria-label="Steer Right"
          >
            <ChevronRight className="w-6 h-6" />
          </button>
        </div>

        {/* Accelerate, Brake, Nitro */}
        <div className="flex items-center gap-2">
          <button
            onTouchStart={() => (simRef.current.keys.nitro = true)}
            onTouchEnd={() => (simRef.current.keys.nitro = false)}
            onMouseDown={() => (simRef.current.keys.nitro = true)}
            onMouseUp={() => (simRef.current.keys.nitro = false)}
            className="px-3 h-12 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs flex items-center gap-1 active:scale-95 shadow"
            aria-label="Nitro Boost"
          >
            <Zap className="w-4 h-4" />
            <span>NITRO</span>
          </button>
          <button
            onTouchStart={() => (simRef.current.keys.down = true)}
            onTouchEnd={() => (simRef.current.keys.down = false)}
            onMouseDown={() => (simRef.current.keys.down = true)}
            onMouseUp={() => (simRef.current.keys.down = false)}
            className="w-12 h-12 rounded-xl bg-rose-600 hover:bg-rose-500 text-white flex items-center justify-center active:scale-95 shadow"
            aria-label="Brake"
          >
            <ArrowDown className="w-5 h-5" />
          </button>
          <button
            onTouchStart={() => (simRef.current.keys.up = true)}
            onTouchEnd={() => (simRef.current.keys.up = false)}
            onMouseDown={() => (simRef.current.keys.up = true)}
            onMouseUp={() => (simRef.current.keys.up = false)}
            className="w-14 h-12 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center active:scale-95 shadow"
            aria-label="Accelerate"
          >
            <ArrowUp className="w-6 h-6" />
          </button>
        </div>
      </div>
    </div>
  );
};
