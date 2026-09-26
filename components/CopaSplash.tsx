import React, { useEffect, useRef, useState } from 'react';

const COPA_START = new Date('2026-06-11T00:00:00');
const COPA_END   = new Date('2026-07-19T23:59:59');

// Jogos do Brasil na Copa do Mundo 2026
const BRASIL_JOGOS = [
  { data: new Date('2026-06-19T18:00:00'), adversario: 'Haiti',   fase: 'Fase de Grupos' },
  { data: new Date('2026-06-24T18:00:00'), adversario: 'Escócia', fase: 'Fase de Grupos' },
];

function isCopaActive() {
  const now = new Date();
  return now >= COPA_START && now <= COPA_END;
}

function getProximoJogo() {
  const now = new Date();
  return BRASIL_JOGOS.find(j => j.data > now) ?? null;
}

function useCountdown(target: Date | null) {
  const calc = () => {
    if (!target) return null;
    const diff = target.getTime() - Date.now();
    if (diff <= 0) return null;
    const d = Math.floor(diff / 86400000);
    const h = Math.floor((diff % 86400000) / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    return { d, h, m, s };
  };
  const [time, setTime] = useState(calc);
  useEffect(() => {
    const id = setInterval(() => setTime(calc()), 1000);
    return () => clearInterval(id);
  }, [target]);
  return time;
}

interface Props { onClose: () => void; }

export const CopaSplash: React.FC<Props> = ({ onClose }) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying]   = useState(false);
  const [visible, setVisible]   = useState(true);
  const [step, setStep]         = useState(0);
  const copa = isCopaActive();
  const proximoJogo = getProximoJogo();
  const countdown = useCountdown(proximoJogo?.data ?? null);

  // Entrada sequencial: 0→1→2→3→4 a cada ~300ms
  useEffect(() => {
    if (!copa) return;
    const timers = [
      setTimeout(() => setStep(1), 100),
      setTimeout(() => setStep(2), 400),
      setTimeout(() => setStep(3), 700),
      setTimeout(() => setStep(4), 1000),
    ];
    return () => timers.forEach(clearTimeout);
  }, [copa]);

  // Tenta autoplay após animações carregarem (pode ser bloqueado pelo browser)
  useEffect(() => {
    if (!copa) return;
    const t = setTimeout(() => {
      const a = audioRef.current;
      if (!a) return;
      a.play()
        .then(() => setPlaying(true))
        .catch(() => {
          // Browser bloqueou autoplay — usuário precisa clicar no botão
          setPlaying(false);
        });
    }, 1200);
    return () => clearTimeout(t);
  }, [copa]);

  const handleClose = () => {
    setVisible(false);
    audioRef.current?.pause();
    setTimeout(onClose, 350);
  };

  const toggleMusic = () => {
    const a = audioRef.current;
    if (!a) return;
    if (playing) { a.pause(); setPlaying(false); }
    else { a.play().catch(() => {}); setPlaying(true); }
  };

  useEffect(() => {
    if (copa) return;
    const timer = window.setTimeout(handleClose, 5000);
    return () => window.clearTimeout(timer);
  }, [copa]);
  // Modo fora da copa: splash simples
  if (!copa) {
    return (
      <div
        className={`fixed inset-0 bg-green-600 flex items-center justify-center z-50 text-white transition-opacity duration-500 cursor-pointer ${visible ? 'opacity-100' : 'opacity-0'}`}
        onClick={handleClose}
        onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') handleClose(); }}
        role="button"
        tabIndex={0}
        aria-label="Entrar no sistema Villa Di Trento"
      >
        <div className="flex flex-col items-center gap-4 px-6 text-center">
          <h1 className="text-4xl font-bold animate-pulse">Villa Di Trento</h1>
          <p className="text-base font-semibold">Toque em qualquer lugar para entrar</p>
          <p className="text-sm text-white/80">Você será direcionado automaticamente em até 5 segundos.</p>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center overflow-hidden select-none transition-opacity duration-500 ${visible ? 'opacity-100' : 'opacity-0'}`}
      style={{ background: 'radial-gradient(ellipse at 50% 0%, #1e7a35 0%, #0d4a1c 45%, #071f0d 100%)' }}
    >
      {/* Campo SVG de fundo */}
      <FieldBg />

      {/* Confetes */}
      <Confetti />

      {/* === Conteúdo === */}
      <div className="relative z-10 flex flex-col items-center text-center px-6 gap-4 w-full max-w-sm">

        {/* Bola girando */}
        <div
          className={`transition-all duration-500 ${step >= 1 ? 'opacity-100 scale-100' : 'opacity-0 scale-50'}`}
          style={{ animation: step >= 1 ? 'copa-spin 4s linear infinite' : 'none', fontSize: 72, lineHeight: 1 }}
        >
          ⚽
        </div>

        {/* Título */}
        <div className={`transition-all duration-500 delay-100 ${step >= 2 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
          <p className="text-yellow-400 text-xs font-bold tracking-[4px] uppercase mb-1">FIFA World Cup</p>
          <h1
            className="font-black text-white uppercase leading-none"
            style={{ fontSize: 38, letterSpacing: 2, textShadow: '0 0 40px rgba(255,215,0,0.4)' }}
          >
            Copa do<br />
            <span style={{ color: '#ffd700' }}>Mundo 2026</span>
          </h1>
          <p className="text-white/50 text-xs mt-1 tracking-widest">🇺🇸 USA · 🇨🇦 CAN · 🇲🇽 MEX</p>
        </div>

        {/* Countdown próximo jogo Brasil */}
        {countdown && proximoJogo && (
          <div className={`w-full transition-all duration-500 delay-200 ${step >= 3 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
            <p className="text-white/60 text-[11px] uppercase tracking-widest mb-2">
              🇧🇷 Brasil × {proximoJogo.adversario} · {proximoJogo.fase}
            </p>
            <div className="flex justify-center gap-2">
              {[
                { v: countdown.d, l: 'dias' },
                { v: countdown.h, l: 'horas' },
                { v: countdown.m, l: 'min' },
                { v: countdown.s, l: 'seg' },
              ].map(({ v, l }) => (
                <div
                  key={l}
                  className="flex flex-col items-center rounded-xl px-3 py-2 min-w-[52px]"
                  style={{ background: 'rgba(255,255,255,0.08)', border: '0.5px solid rgba(255,255,255,0.15)' }}
                >
                  <span
                    className="text-yellow-400 font-black text-xl leading-none"
                    style={{ fontVariantNumeric: 'tabular-nums' }}
                  >
                    {String(v).padStart(2, '0')}
                  </span>
                  <span className="text-white/40 text-[9px] uppercase tracking-wider mt-0.5">{l}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Player + Botão entrar */}
        <div className={`flex flex-col items-center gap-3 w-full transition-all duration-500 delay-300 ${step >= 4 ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
          <audio ref={audioRef} loop>
            <source src="/musica-copa.mp3" type="audio/mpeg" />
          </audio>

          {/* Botão música */}
          <button
            onClick={toggleMusic}
            className="flex items-center gap-3 px-4 py-2.5 rounded-full transition-all active:scale-95 w-full max-w-xs"
            style={{
              background: playing ? 'rgba(255,215,0,0.15)' : 'rgba(255,255,255,0.1)',
              border: playing ? '0.5px solid rgba(255,215,0,0.4)' : '0.5px solid rgba(255,255,255,0.2)',
              boxShadow: playing ? '0 0 16px rgba(255,215,0,0.15)' : 'none',
            }}
          >
            <span
              className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
              style={{ background: '#ffd700', color: '#0d3b18' }}
            >
              {playing ? '⏸' : '▶'}
            </span>
            <span className="text-left flex-1">
              <span className="block text-white text-xs font-semibold">Tema Copa 2026</span>
              <span className="block text-white/50 text-[10px]">
                {playing ? 'Tocando agora...' : 'Toque para ouvir a música'}
              </span>
            </span>
            <MusicBars active={playing} />
          </button>

          {/* Botão entrar */}
          <button
            onClick={handleClose}
            className="w-full max-w-xs py-3.5 rounded-2xl font-black text-sm uppercase tracking-wider transition-all active:scale-95"
            style={{ background: '#ffd700', color: '#0a2e12', boxShadow: '0 0 32px rgba(255,215,0,0.3)' }}
          >
            Entrar no App →
          </button>

          <p className="text-white/25 text-[10px] tracking-[3px] uppercase">Villa Di Trento</p>
        </div>
      </div>

      <style>{`
        @keyframes copa-spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        @keyframes copa-bar {
          from { height: 3px; }
          to   { height: 16px; }
        }
        @keyframes copa-fall {
          from { transform: translateY(-30px) rotate(0deg); opacity: 1; }
          to   { transform: translateY(105vh) rotate(720deg); opacity: 0; }
        }
      `}</style>
    </div>
  );
};

/* ---- Gramado SVG ---- */
const FieldBg: React.FC = () => (
  <svg
    className="absolute inset-0 w-full h-full pointer-events-none"
    style={{ opacity: 0.055 }}
    viewBox="0 0 390 844"
    preserveAspectRatio="xMidYMid slice"
    xmlns="http://www.w3.org/2000/svg"
  >
    <rect x="20" y="20" width="350" height="804" fill="none" stroke="white" strokeWidth="2" />
    <line x1="20" y1="422" x2="370" y2="422" stroke="white" strokeWidth="1.5" />
    <circle cx="195" cy="422" r="70" fill="none" stroke="white" strokeWidth="1.5" />
    <circle cx="195" cy="422" r="4" fill="white" />
    <rect x="110" y="20" width="170" height="90" fill="none" stroke="white" strokeWidth="1.5" />
    <rect x="110" y="734" width="170" height="90" fill="none" stroke="white" strokeWidth="1.5" />
    <rect x="148" y="20" width="94" height="44" fill="none" stroke="white" strokeWidth="1.5" />
    <rect x="148" y="780" width="94" height="44" fill="none" stroke="white" strokeWidth="1.5" />
    <circle cx="195" cy="130" r="4" fill="white" />
    <circle cx="195" cy="714" r="4" fill="white" />
    {/* arcos de escanteio */}
    <path d="M20,20 Q34,20 34,34" fill="none" stroke="white" strokeWidth="1.5" />
    <path d="M370,20 Q356,20 356,34" fill="none" stroke="white" strokeWidth="1.5" />
    <path d="M20,824 Q34,824 34,810" fill="none" stroke="white" strokeWidth="1.5" />
    <path d="M370,824 Q356,824 356,810" fill="none" stroke="white" strokeWidth="1.5" />
  </svg>
);

/* ---- Barrinhas de música ---- */
const MusicBars: React.FC<{ active: boolean }> = ({ active }) => (
  <div className="flex items-end gap-[2px]" style={{ height: 18 }}>
    {[0, 0.12, 0.24, 0.08, 0.18].map((delay, i) => (
      <div
        key={i}
        style={{
          width: 3,
          borderRadius: 2,
          background: '#ffd700',
          minHeight: 3,
          height: active ? undefined : 3,
          animation: active ? `copa-bar 0.65s ease-in-out ${delay}s infinite alternate` : 'none',
        }}
      />
    ))}
  </div>
);

/* ---- Confetes (círculos + quadrados) ---- */
const COLORS = ['#ffd700', '#22c55e', '#ffffff', '#ef4444', '#3b82f6', '#fbbf24'];

const Confetti: React.FC = () => {
  const pieces = React.useMemo(() => Array.from({ length: 30 }, (_, i) => ({
    id: i,
    left: Math.random() * 100,
    size: 4 + Math.random() * 6,
    duration: 3.5 + Math.random() * 4,
    delay: Math.random() * 5,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    round: Math.random() > 0.5,
  })), []);

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {pieces.map(p => (
        <div
          key={p.id}
          style={{
            position: 'absolute',
            left: `${p.left}%`,
            top: -20,
            width: p.size,
            height: p.size,
            borderRadius: p.round ? '50%' : 2,
            background: p.color,
            animation: `copa-fall ${p.duration}s ${p.delay}s linear infinite`,
          }}
        />
      ))}
    </div>
  );
};
