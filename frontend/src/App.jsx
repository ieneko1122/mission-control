import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

// ── Aquarium (Bio Matrix) — full-screen background layer ─────────────────────
const AQUARIUM_KEY = 'mission_aquarium_count';
const AQ_COLORS = ['#00ffaa', '#00ffff', '#ff9900', '#cc77ff', '#3399ff'];
const SEG_SIZES = [6, 13, 9, 6, 3];
const SEG_SPACING = 14;
const AQ_TRAIL_MAX = (SEG_SIZES.length - 1) * SEG_SPACING + 40;

function aqBodyPt(trail, dist) {
  if (!trail || trail.length < 2) return { x: trail?.[0]?.x ?? 0, y: trail?.[0]?.y ?? 0, angle: 0 };
  if (dist <= 0) return { x: trail[0].x, y: trail[0].y, angle: Math.atan2(trail[0].y - trail[1].y, trail[0].x - trail[1].x) };
  let cum = 0;
  for (let i = 0; i < trail.length - 1; i++) {
    const dx = trail[i + 1].x - trail[i].x;
    const dy = trail[i + 1].y - trail[i].y;
    const len = Math.sqrt(dx * dx + dy * dy);
    if (len < 0.001) continue;
    if (cum + len >= dist) {
      const t = (dist - cum) / len;
      return { x: trail[i].x + dx * t, y: trail[i].y + dy * t, angle: Math.atan2(-dy, -dx) };
    }
    cum += len;
  }
  const last = trail[trail.length - 1];
  const prev = trail[trail.length - 2];
  return { x: last.x, y: last.y, angle: Math.atan2(prev.y - last.y, prev.x - last.x) };
}

function aqDrawSeg(ctx, type, r, color) {
  ctx.shadowColor = color;
  ctx.shadowBlur = 12;
  if (type === 'circle') {
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.stroke();
  } else if (type === 'square') {
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.8;
    ctx.strokeRect(-r, -r, r * 2, r * 2);
  } else {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(r * 1.7, 0);
    ctx.lineTo(0, r * 0.9);
    ctx.lineTo(-r * 1.0, 0);
    ctx.lineTo(0, -r * 0.9);
    ctx.closePath();
    ctx.fill();
  }
}

function aqMake(W, H, mature) {
  const types = ['circle', 'square', 'kite'];
  const type = types[Math.floor(Math.random() * 3)];
  const angle = Math.random() * Math.PI * 2;
  const x = 40 + Math.random() * Math.max(1, W - 80);
  const y = 40 + Math.random() * Math.max(1, H - 80);
  const speed = 0.55 + Math.random() * 0.45;
  const step = mature ? speed : 0.05;
  const trail = Array.from({ length: AQ_TRAIL_MAX + 10 }, (_, i) => ({
    x: x - Math.cos(angle) * i * step,
    y: y - Math.sin(angle) * i * step,
  }));
  return { id: Math.random(), x, y, angle, targetAngle: angle, speed, type, color: AQ_COLORS[Math.floor(Math.random() * AQ_COLORS.length)], trail };
}

function AquariumPanel({ spawnTrigger, clearTrigger }) {
  const canvasRef = useRef(null);
  const creaturesRef = useRef([]);
  const animRef = useRef(null);
  const wRef = useRef(window.innerWidth);
  const hRef = useRef(window.innerHeight);

  useEffect(() => {
    if (spawnTrigger === 0) return;
    creaturesRef.current.push(aqMake(wRef.current, hRef.current, false));
    localStorage.setItem(AQUARIUM_KEY, String(creaturesRef.current.length));
  }, [spawnTrigger]);

  useEffect(() => {
    if (clearTrigger === 0) return;
    creaturesRef.current = [];
    localStorage.setItem(AQUARIUM_KEY, '0');
  }, [clearTrigger]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const W = window.innerWidth;
    const H = window.innerHeight;
    wRef.current = W;
    hRef.current = H;
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');

    const saved = parseInt(localStorage.getItem(AQUARIUM_KEY) || '0', 10);
    creaturesRef.current = Array.from({ length: saved }, () => aqMake(W, H, true));

    const loop = () => {
      ctx.clearRect(0, 0, W, H);

      for (const c of creaturesRef.current) {
        const margin = 60;
        if (c.x < margin || c.x > W - margin || c.y < margin || c.y > H - margin) {
          c.targetAngle = Math.atan2(H / 2 - c.y, W / 2 - c.x) + (Math.random() - 0.5) * 0.5;
        } else {
          if (c.turnCooldown > 0) {
            c.turnCooldown--;
          } else {
            const r = Math.random();
            if (r < 0.015) {
              c.targetAngle += (Math.random() < 0.5 ? 1 : -1) * (Math.PI * 0.4 + Math.random() * Math.PI * 0.5);
              c.sharpTurn = true;
              c.turnCooldown = 180 + Math.floor(Math.random() * 120); // 3〜5秒
            } else if (r < 0.015 + 0.07) {
              c.targetAngle += (Math.random() - 0.5) * 0.06;
              c.turnCooldown = 60 + Math.floor(Math.random() * 60); // 1〜2秒
            }
          }
        }
        let diff = c.targetAngle - c.angle;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        const turnRate = c.sharpTurn ? 0.044 : 0.035;
        c.angle += Math.sign(diff) * Math.min(Math.abs(diff), turnRate);
        if (c.sharpTurn && Math.abs(diff) < 0.05) c.sharpTurn = false;
        c.x = Math.max(15, Math.min(W - 15, c.x + Math.cos(c.angle) * c.speed));
        c.y = Math.max(15, Math.min(H - 15, c.y + Math.sin(c.angle) * c.speed));
        c.trail.unshift({ x: c.x, y: c.y });
        if (c.trail.length > AQ_TRAIL_MAX + 10) c.trail.pop();

        for (let i = SEG_SIZES.length - 1; i >= 0; i--) {
          const pt = aqBodyPt(c.trail, i * SEG_SPACING);
          ctx.save();
          ctx.translate(pt.x, pt.y);
          ctx.rotate(pt.angle);
          ctx.globalAlpha = 0.55 + (SEG_SIZES.length - 1 - i) * 0.09;
          aqDrawSeg(ctx, c.type, SEG_SIZES[i], c.color);
          if (i === 0) {
            const hR = SEG_SIZES[0];
            const eR = 1.6;
            ctx.shadowColor = '#ffffff';
            ctx.shadowBlur = 4;
            ctx.fillStyle = '#ffffff';
            ctx.globalAlpha = 0.95;
            ctx.beginPath();
            ctx.arc(hR * 0.5, hR * 0.6, eR, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.arc(hR * 0.5, -hR * 0.6, eR, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.restore();
        }
      }
      animRef.current = requestAnimationFrame(loop);
    };
    loop();
    return () => cancelAnimationFrame(animRef.current);
  }, []);

  return <canvas ref={canvasRef} className="aquarium-canvas-global" />;
}
// ─────────────────────────────────────────────────────────────────────────────
import {
  FREE_LENGTH_OPTIONS,
  loadShiftOverride,
  saveShiftOverride,
  defaultOverride,
  resolveActiveBlock,
  calcProgress,
  calcRemainingMinutes,
  buildExtendOverride,
  buildSkipOverride,
  buildFreeOverride,
  sourceLabel,
} from './schedule';
import './App.css';

export default function App() {
  const [operators, setOperators] = useState([]);
  const [presentIds, setPresentIds] = useState([]);
  const [queues, setQueues] = useState({ assembly: [], report: [], feedback: [] });

  const [result, setResult] = useState(() => {
    const saved = localStorage.getItem('mission_result');
    return saved ? JSON.parse(saved) : null;
  });

  const [logTerminal, setLogTerminal] = useState(['[SYSTEM] CENTRAL MATRIX ONLINE.']);
  const [showAdmin, setShowAdmin] = useState(false);

  // --- ガジェット用の状態 ---
  const [currentTime, setCurrentTime] = useState(new Date().toLocaleTimeString());

  // DOWN-TIMER (カウントダウン)
  const [timeLeft, setTimeLeft] = useState(0);
  const [timerActive, setTimerActive] = useState(false);

  // UP-TIMER (ストップウォッチ: 1/10秒単位)
  const [stopwatchTime, setStopwatchTime] = useState(0);
  const [stopwatchActive, setStopwatchActive] = useState(false);

  // --- 管理者オーバーライド用の状態 ---
  const [nextAssembly, setNextAssembly] = useState(1);
  const [nextReport, setNextReport] = useState(1);
  const [nextFeedback, setNextFeedback] = useState(1);

  const API_BASE = '/api';

  const OPS_MILESTONES = {
    5: 'SUPPORT RANK: BRONZE',
    10: 'SUPPORT RANK: SILVER',
    20: 'SUPPORT RANK: GOLD',
    50: '!!! LEGENDARY OPERATOR !!!',
  };

  const loadDailyOpsCount = () => {
    const today = new Date().toDateString();
    const savedDate = localStorage.getItem('mission_ops_date');
    if (savedDate !== today) {
      localStorage.setItem('mission_ops_date', today);
      localStorage.setItem('mission_ops_count', '0');
      return 0;
    }
    return Number(localStorage.getItem('mission_ops_count')) || 0;
  };

  const [shiftOverride, setShiftOverride] = useState(() => {
    const now = new Date();
    return loadShiftOverride() ?? defaultOverride(now);
  });
  const [shiftTick, setShiftTick] = useState(0);
  const [freeMinutes, setFreeMinutes] = useState(50);
  const [opsCount, setOpsCount] = useState(loadDailyOpsCount);
  const [showKanji, setShowKanji] = useState(false);
  const [aquariumSpawn, setAquariumSpawn] = useState(0);
  const [aquariumClear, setAquariumClear] = useState(0);
  const lastPhaseIdRef = useRef(null);
  const completedPhaseKeysRef = useRef(new Set());

  const addLog = (msg) => {
    setLogTerminal(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev.slice(0, 4)]);
  };

  useEffect(() => {
    fetchStatus();
    const id = setInterval(() => {
      setCurrentTime(new Date().toLocaleTimeString());
      setShiftTick(t => t + 1);
      if (timerActive) setTimeLeft(prev => { if (prev <= 1) { setTimerActive(false); addLog('TIME OVER.'); return 0; } return prev - 1; });
      if (stopwatchActive) setStopwatchTime(prev => prev + 1);
    }, 1000);
    return () => clearInterval(id);
  }, [timerActive, stopwatchActive]);

  const fetchStatus = async () => {
    try {
      const res = await fetch(`${API_BASE}/status`);
      const data = await res.json();
      setOperators(data.operators || []);
      setQueues(data.queues || { report: [], feedback: [] });
    } catch (err) {
      addLog('ERROR: SYSTEM LINK FAILED.');
    }
  };

  const now = new Date();
  const activeBlock = resolveActiveBlock(now, shiftOverride);
  const shiftProgress = calcProgress(activeBlock);
  const filledSegments = Math.floor(shiftProgress / 10);
  const shiftRemainingMin = calcRemainingMinutes(activeBlock);

  const applyOverride = (override) => {
    setShiftOverride(override);
    saveShiftOverride(override);
  };

  const resetToAuto = () => {
    const next = defaultOverride(new Date());
    applyOverride(next);
    addLog('SHIFT MODE: AUTO RESTORED.');
  };

  useEffect(() => {
    if (!activeBlock.active || activeBlock.id === 'inactive') return;
    if (lastPhaseIdRef.current === activeBlock.id) return;
    lastPhaseIdRef.current = activeBlock.id;
    addLog(`PHASE: ${activeBlock.label} [${sourceLabel(activeBlock.source)}]`);
  }, [activeBlock.id, activeBlock.label, activeBlock.source]);

  useEffect(() => {
    if (!activeBlock.active || shiftProgress < 100) return;
    const key = `${activeBlock.id}-${now.toDateString()}`;
    if (completedPhaseKeysRef.current.has(key)) return;
    completedPhaseKeysRef.current.add(key);
    addLog(`${activeBlock.label} PHASE CLEAR.`);
    setAquariumSpawn(n => n + 1);
  }, [shiftProgress, activeBlock.id, activeBlock.label, activeBlock.active, shiftTick]);

  const extendBlock = (minutes) => {
    if (!activeBlock.active) {
      addLog('ERROR: NO ACTIVE PHASE.');
      return;
    }
    const next = buildExtendOverride(new Date(), shiftOverride, activeBlock, minutes);
    applyOverride(next);
    addLog(`EXTEND +${minutes}M >> ${activeBlock.label}`);
  };

  const skipToNext = () => {
    const next = buildSkipOverride(new Date(), shiftOverride);
    if (!next) {
      addLog('ERROR: NO NEXT PHASE.');
      return;
    }
    applyOverride(next);
    addLog(`SKIP >> ${activeBlock.label}`);
  };

  const cycleFreeMinutes = () => {
    const idx = FREE_LENGTH_OPTIONS.indexOf(freeMinutes);
    const next = FREE_LENGTH_OPTIONS[(idx + 1) % FREE_LENGTH_OPTIONS.length];
    setFreeMinutes(next);
  };

  const startFreeMode = () => {
    const override = buildFreeOverride(new Date(), freeMinutes);
    applyOverride(override);
    addLog(`FREE MODE: ${freeMinutes} MIN.`);
  };

  const syncDownTimerToShift = () => {
    if (!activeBlock.active || !activeBlock.endMs) return;
    const remaining = Math.max(0, Math.ceil((activeBlock.endMs - Date.now()) / 1000));
    if (remaining === 0) return;
    setTimeLeft(remaining);
    setTimerActive(true);
    addLog(`SYNC: DOWN-TIMER >> ${Math.ceil(remaining / 60)}M`);
  };

  const setMissionTimer = (minutes) => {
    setTimeLeft(minutes * 60);
    setTimerActive(false);
  };

  const formatDownTimer = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  const formatUpTimer = (t) => {
    const totalSec = Math.floor(t);
    return `${String(Math.floor(totalSec / 60)).padStart(2, '0')}:${String(totalSec % 60).padStart(2, '0')}`;
  };

  const incrementOps = () => {
    const next = opsCount + 1;
    setOpsCount(next);
    const today = new Date().toDateString();
    localStorage.setItem('mission_ops_count', String(next));
    localStorage.setItem('mission_ops_date', today);
    addLog(`FIELD OP #${next} LOGGED.`);
    if (OPS_MILESTONES[next]) addLog(OPS_MILESTONES[next]);
    setAquariumSpawn(n => n + 1);
  };

  const decrementOps = () => {
    if (opsCount <= 0) return;
    const next = opsCount - 1;
    setOpsCount(next);
    localStorage.setItem('mission_ops_count', String(next));
    addLog(`FIELD OP REVERT: #${next}.`);
  };

  const resetOps = () => {
    setOpsCount(0);
    localStorage.setItem('mission_ops_count', '0');
    localStorage.setItem('mission_ops_date', new Date().toDateString());
    addLog('FIELD OPS COUNTER RESET.');
  };

  const opsRank =
    opsCount >= 50 ? 'LEGEND' :
    opsCount >= 20 ? 'GOLD' :
    opsCount >= 10 ? 'SILVER' :
    opsCount >= 5 ? 'BRONZE' : 'ROOKIE';

  const gaugeTypeClass = activeBlock.type ? `segment-gauge--${activeBlock.type}` : '';
  const gaugeStateClass =
    shiftProgress >= 100 ? 'segment-gauge--complete' :
    shiftProgress >= 75 ? 'segment-gauge--critical' : '';
  const gaugeClass = `${gaugeTypeClass} ${gaugeStateClass}`.trim();
  const isManualMode = shiftOverride.mode !== 'auto';
  const displayName = (op) => (showKanji && op.nameKanji) ? op.nameKanji : op.name;
  // ROSTER の result は旧データの可能性があるため operators リストから nameKanji を補完する
  const displayResultName = (resultOp) => {
    const fresh = operators.find(o => o.id === resultOp.id);
    return displayName(fresh ?? resultOp);
  };

  const toggleAttendance = (id) => {
    setPresentIds(prev => prev.includes(id) ? prev.filter(pId => pId !== id) : [...prev, id]);
  };

  const setAllPresent = () => {
    setPresentIds(operators.map(op => op.id));
    addLog('ATTENDANCE: ALL OPERATORS INSERTED.');
  };

  const clearAllPresent = () => {
    setPresentIds([]);
    addLog('ATTENDANCE: ALL OPERATORS CLEARED.');
  };

  const adjustMissionTimer = (seconds) => {
    setTimeLeft(prev => Math.max(prev + seconds, 0));
    if (seconds > 0) {
      setTimerActive(true);
      addLog(`TIMER EXTENDED: +${seconds} SEC.`);
    }
  };

  const triggerAllocation = async () => {
    addLog('RUNNING INDEPENDENT ALLOCATION...');
    try {
      const res = await fetch(`${API_BASE}/missions/allocate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ presentOperatorIds: presentIds })
      });
      const data = await res.json();

      const formattedResult = {
        assembly: data.find(m => m.missionType === 'ASSEMBLY')?.assignedOperators || [],
        report: data.find(m => m.missionType === 'REPORT')?.assignedOperators || [],
        feedback: data.find(m => m.missionType === 'FEEDBACK')?.assignedOperators || []
      };

      const prev = localStorage.getItem('mission_result');
      if (prev) localStorage.setItem('mission_result_prev', prev);
      setResult(formattedResult);
      localStorage.setItem('mission_result', JSON.stringify(formattedResult));
      addLog('DAILY ROSTER ALLOCATED.');
    } catch (err) {
      addLog('ERROR: PROCESSING INTERRUPTED.');
      console.error(err);
    }
  };

  const handleRollback = async () => {
    if (!window.confirm('[WARNING] 直近のログを破棄し、進行状況を巻き戻します。よろしいですか？')) return;
    try {
      const res = await fetch(`${API_BASE}/admin/rollback`, { method: 'DELETE' });
      const data = await res.json();
      addLog(`ROLLBACK EXEC: ${data.message}`);
      setShowAdmin(false);

      const prev = localStorage.getItem('mission_result_prev');
      if (prev) {
        setResult(JSON.parse(prev));
        localStorage.setItem('mission_result', prev);
        localStorage.removeItem('mission_result_prev');
        addLog('>> 直前の割当結果を復元しました。');
      } else {
        setResult(null);
        localStorage.removeItem('mission_result');
        addLog('>> 割当履歴がありません。');
      }
    } catch (err) {
      addLog('ERROR: ROLLBACK REJECTED.');
    }
  };

  const handleSyncOverride = async () => {
    if (!window.confirm('[WARNING] システムの進行状況を強制的に上書きします。よろしいですか？')) return;
    try {
      const res = await fetch(`${API_BASE}/admin/update-status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          nextAssemblyOperatorId: nextAssembly,
          nextReportOperatorId: nextReport,
          nextFeedbackOperatorId: nextFeedback
        })
      });
      const data = await res.json();
      addLog(`OVERRIDE APPLIED: ${data.message || 'SUCCESS'}`);
      setShowAdmin(false);
      await triggerAllocation();
    } catch (err) {
      addLog('ERROR: OVERRIDE SYNC FAILED.');
      console.error(err);
    }
  };

  const isTimeOverAlert = timeLeft === 0 && !timerActive && logTerminal[0]?.includes('TIME OVER');

  return (
    <div className={`app-shell ${isTimeOverAlert ? 'time-over-flash' : ''}`}>
      {/* 全画面背景レイヤー: セグメントフィッシュ */}
      <AquariumPanel spawnTrigger={aquariumSpawn} clearTrigger={aquariumClear} />

      <header className="app-header">
        <h1 className="app-title">
          <span className="accent-green">[{'>'}{'>'}]</span> MISSION_MGMNT_SYS <span className="app-subtitle">[SYS_CTRL_v3.00_GAME_MODE]</span>
        </h1>
        <div className="header-right">
          <div className="fish-ctrl">
            <button type="button" className="fish-btn" onClick={() => setAquariumSpawn(n => n + 1)}>▶ SPAWN</button>
            <button type="button" className="fish-btn fish-btn--clr" onClick={() => setAquariumClear(n => n + 1)}>✕ CLR</button>
          </div>
          <div className="retro-clock">
            1P-TIME <span className="accent-orange">{currentTime}</span>
          </div>
        </div>
      </header>

      <div className="dashboard-grid">

        {/* LEFT COLUMN: ATTENDANCE */}
        <div className="cyber-panel attendance-panel">
          <div>
            <h2 className="panel-heading">:: OPERATORS ATTENDANCE [オペレーター出席状況]</h2>
            <div className="attendance-toolbar">
              <div className="attendance-metrics">
                <span className="retro-badge-cyan">PRESENT {presentIds.length}</span>
                <span className="retro-badge-cyan">ABSENT {Math.max(operators.length - presentIds.length, 0)}</span>
                <span className="retro-badge-cyan">TOTAL {operators.length}</span>
              </div>
              <div className="attendance-actions">
                <button type="button" className="retro-mini-btn" onClick={setAllPresent}>ALL</button>
                <button type="button" className="retro-mini-btn danger" onClick={clearAllPresent}>NONE</button>
                <button type="button" className={`retro-mini-btn ${showKanji ? 'active-kanji' : ''}`} onClick={() => setShowKanji(v => !v)}>
                  {showKanji ? '漢字' : 'KANA'}
                </button>
              </div>
            </div>
            <div className="attendance-body">
              <div className="matrix-grid">
                {operators.map(op => {
                  const isPresent = presentIds.includes(op.id);
                  return (
                    <div key={op.id} className={`operator-card ${isPresent ? 'present' : 'absent'}`} onClick={() => toggleAttendance(op.id)}>
                      <div className="op-id">ID:{String(op.displayOrder).padStart(2, '0')}</div>
                      <div className="op-name">{displayName(op)}</div>
                      <div className="op-status">{isPresent ? '▶ INSERTED' : '▷ EMPTY'}</div>
                    </div>
                  );
                })}
              </div>

              <aside className="side-deck" aria-label="シフト状況">
                <div className="side-deck__block">
                  <div className="side-deck__heading">:: SHIFT LOAD [時間割連動]</div>
                  <div className="shift-phase-label">{activeBlock.label}</div>
                  <div className={`segment-gauge ${gaugeClass}`} title={`${Math.round(shiftProgress)}%`}>
                    {Array.from({ length: 10 }, (_, i) => (
                      <div
                        key={i}
                        className={`segment-gauge__cell ${i < filledSegments ? 'segment-gauge__cell--on' : ''}`}
                      />
                    ))}
                  </div>
                  <div className="side-deck__meta">
                    {activeBlock.active
                      ? `${Math.round(shiftProgress)}% · 残り約${shiftRemainingMin}分 · ${sourceLabel(activeBlock.source)}`
                      : activeBlock.rangeLabel}
                  </div>
                  <div className="side-deck__time">{activeBlock.rangeLabel}</div>
                  <div className="side-deck__actions shift-actions-grid">
                    <button type="button" className="retro-mini-btn" onClick={() => extendBlock(5)} disabled={!activeBlock.active}>+5</button>
                    <button type="button" className="retro-mini-btn" onClick={() => extendBlock(10)} disabled={!activeBlock.active}>+10</button>
                    <button type="button" className="retro-mini-btn" onClick={skipToNext}>NEXT</button>
                    <button type="button" className="retro-mini-btn" onClick={resetToAuto} disabled={!isManualMode}>AUTO</button>
                    <button type="button" className="retro-mini-btn" onClick={cycleFreeMinutes}>{freeMinutes}M</button>
                    <button type="button" className="retro-mini-btn" onClick={startFreeMode}>FREE</button>
                    <button type="button" className="retro-mini-btn" onClick={syncDownTimerToShift} disabled={!activeBlock.active}>SYNC</button>
                  </div>
                </div>

                <div className="side-deck__block side-deck__block--ops">
                  <div className="side-deck__heading">:: FIELD OPS [巡視・対応]</div>
                  <div className="ops-counter-value">{opsCount}</div>
                  <div className="ops-counter-rank">RANK: {opsRank}</div>
                  <div className="side-deck__actions ops-counter-actions">
                    <button type="button" className="retro-mini-btn" onClick={decrementOps} disabled={opsCount === 0}>−</button>
                    <button type="button" className="retro-mini-btn ops-counter-plus" onClick={incrementOps}>
                      ＋ LOG
                    </button>
                    <button type="button" className="retro-mini-btn danger" onClick={resetOps}>RST</button>
                  </div>
                  <p className="side-deck__hint">質問対応・巡視のたびに＋LOG</p>
                </div>
              </aside>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: GADGETS & LOGS */}
        <aside className="dashboard-sidebar">

          {/* TACTICAL TIME CONTROLLER */}
          <div className="cyber-panel panel-timer">
            <h3 className="panel-heading panel-heading--danger">:: TACTICAL TIME CONTROLLER</h3>

            <div className="timer-row">
              <div className="timer-block">
                <div className="timer-label">UP-TIMER</div>
                <div className={`timer-display ${stopwatchTime > 0 ? 'active' : ''}`}>
                  {formatUpTimer(stopwatchTime)}
                </div>
                <div className="timer-actions">
                  <button type="button" className="retro-mini-btn" onClick={() => setStopwatchActive(!stopwatchActive)}>
                    {stopwatchActive ? 'STOP' : 'START'}
                  </button>
                  <button type="button" className="retro-mini-btn danger" onClick={() => { setStopwatchActive(false); setStopwatchTime(0); }}>
                    RST
                  </button>
                </div>
              </div>

              <div className="timer-block">
                <div className="timer-label">DOWN-TIMER</div>
                <div className={`timer-display ${timeLeft > 0 ? 'active' : ''}`}>
                  {formatDownTimer(timeLeft)}
                </div>
                <div className="timer-btn-grid">
                  <button type="button" className="retro-mini-btn" onClick={() => adjustMissionTimer(30)}>+30S</button>
                  <button type="button" className="retro-mini-btn" onClick={() => adjustMissionTimer(60)}>+1M</button>
                  <button type="button" className="retro-mini-btn" onClick={() => adjustMissionTimer(300)}>+5M</button>
                  <button type="button" className="retro-mini-btn" onClick={() => adjustMissionTimer(600)}>+10M</button>
                </div>
                <div className="timer-btn-grid" style={{ marginTop: '4px' }}>
                  <button type="button" className="retro-mini-btn" onClick={() => setTimerActive(!timerActive)} disabled={timeLeft === 0}>
                    {timerActive ? 'PAUSE' : 'START'}
                  </button>
                  <button type="button" className="retro-mini-btn" onClick={() => setMissionTimer(10)}>SET10</button>
                  <button type="button" className="retro-mini-btn" onClick={() => setMissionTimer(20)}>SET20</button>
                  <button type="button" className="retro-mini-btn danger" onClick={() => { setTimeLeft(0); setTimerActive(false); }}>CLR</button>
                </div>
              </div>
            </div>
          </div>

          {/* INTERRUPT QUEUE */}
          <div className="cyber-panel panel-queue">
            <h3 className="panel-heading panel-heading--warn">:: INTERRUPT QUEUE [次回優先キュー]</h3>
            <div className="queue-line">
              <span className="queue-label">-- REPORT: </span>
              {queues.report?.map((name, i) => <span key={i} className="retro-badge-cyan">!{name}</span>)}
              {queues.report?.length === 0 && <span className="queue-empty">NONE</span>}
            </div>
            <div className="queue-line">
              <span className="queue-label">-- FEEDBACK: </span>
              {queues.feedback?.map((name, i) => <span key={i} className="retro-badge-cyan">!{name}</span>)}
              {queues.feedback?.length === 0 && <span className="queue-empty">NONE</span>}
            </div>
          </div>

          {/* LOG TERMINAL */}
          <div className="cyber-panel log-panel">
            <div className="log-panel__title">OUTPUT LOG MATRIX</div>
            <div className="log-panel__body">
              {logTerminal.map((log, i) => (
                <div key={i} className={`log-line ${log.includes('ERROR') || log.includes('OVER') ? 'log-line--alert' : ''}`}>
                  {log}
                </div>
              ))}
            </div>
            <div className="log-panel__prompt">
              C:\SYS\_<span className="blinking-cursor">█</span>
            </div>
          </div>
        </aside>
      </div>

      {/* ROSTER SECTION */}
      {result && (
        <div className="cyber-panel roster-panel">
          <h2 className="panel-heading panel-heading--cyan">:: DAILY ALLOCATION ROSTER [本日のアサイン結果]</h2>
          <div className="roster-grid">
            <div className="roster-card">
              <h3 className="roster-title">ASSEMBLY (1名)</h3>
              <div className="roster-name roster-highlight"><span style={{color: '#fff'}}>[!]</span> {result.assembly?.[0] ? displayResultName(result.assembly[0]) : '---'}</div>
            </div>
            <div className="roster-card">
              <h3 className="roster-title">REPORT (2名)</h3>
              {result.report?.map(op => <div key={op.id} className="roster-name roster-highlight"><span style={{color: '#fff'}}>[{'>'}{'>'}]</span> {displayResultName(op)}</div>)}
              {result.report?.length === 0 && <div className="roster-name" style={{ color: '#2c3b47' }}>---</div>}
            </div>
            <div className="roster-card">
              <h3 className="roster-title">FEEDBACK (2名)</h3>
              {result.feedback?.map(op => <div key={op.id} className="roster-name roster-highlight"><span style={{color: '#fff'}}>[{'>'}{'>'}]</span> {displayResultName(op)}</div>)}
              {result.feedback?.length === 0 && <div className="roster-name" style={{ color: '#2c3b47' }}>---</div>}
            </div>
          </div>
        </div>
      )}

      {/* CONTROLS */}
      <div className="controls-grid">
        <button type="button" className="cyber-btn main-btn" onClick={triggerAllocation}>:: RUN ALLOCATION SEQUENCE (割当実行) ::</button>
        <button type="button" className="cyber-btn cyber-btn--warn" onClick={() => setShowAdmin(true)}>
          // EMERGENCY PROTOCOL (管理者権限)
        </button>
      </div>

      {showAdmin && createPortal(
        <div className="modal-overlay" onClick={() => setShowAdmin(false)}>
          <div className="cyber-panel admin modal-content" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close-btn" onClick={() => setShowAdmin(false)}>X</button>
            <h2 style={{ margin: '0 0 16px 0', fontSize: '14px', borderBottom: '1px dotted #ff9900', paddingBottom: '4px' }}>
              :: SYSTEM EXCEPTION PROTOCOL // MANUAL OVERRIDE
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '20px' }}>
              <div style={{ borderRight: '1px dotted #ff9900', paddingRight: '12px' }}>
                <h3 style={{ margin: '0 0 4px 0', fontSize: '12px', color: '#fff' }}>-- ROLLBACK</h3>
                <p style={{ fontSize: '10px', color: '#a66400', margin: '0 0 12px 0' }}>直近のアサイン結果を破棄し、1ターン巻き戻します。</p>
                <button className="cyber-btn danger" onClick={handleRollback} style={{ padding: '8px 12px', fontSize: '11px', width: '100%' }}>
                  [!] EXECUTE
                </button>
              </div>
              <div>
                <h3 style={{ margin: '0 0 4px 0', fontSize: '12px', color: '#fff' }}>-- TARGET SELECTION</h3>
                <p style={{ fontSize: '10px', color: '#a66400', margin: '0 0 12px 0' }}>次回のアサイン対象者を個別に強制指定し、キューを上書きします。</p>
                <div style={{ display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>

                  <label className="retro-select-container">
                    <span className="select-label">ASSEMBLY:</span>
                    <select className="retro-select" value={nextAssembly} onChange={e => setNextAssembly(Number(e.target.value))}>
                      {operators.map(op => <option key={op.id} value={op.id}>{op.nameKanji ? `${op.nameKanji} (${op.name})` : op.name}</option>)}
                    </select>
                  </label>

                  <label className="retro-select-container">
                    <span className="select-label">REPORT:</span>
                    <select className="retro-select" value={nextReport} onChange={e => setNextReport(Number(e.target.value))}>
                      {operators.map(op => <option key={op.id} value={op.id}>{op.nameKanji ? `${op.nameKanji} (${op.name})` : op.name}</option>)}
                    </select>
                  </label>

                  <label className="retro-select-container">
                    <span className="select-label">FEEDBACK:</span>
                    <select className="retro-select" value={nextFeedback} onChange={e => setNextFeedback(Number(e.target.value))}>
                      {operators.map(op => <option key={op.id} value={op.id}>{op.nameKanji ? `${op.nameKanji} (${op.name})` : op.name}</option>)}
                    </select>
                  </label>
                </div>
                <button className="cyber-btn" onClick={handleSyncOverride} style={{ padding: '8px 16px', fontSize: '11px', borderColor: '#ff9900', color: '#ff9900', width: '100%' }}>
                  [{'>'}{'>'}] SYNC OVERRIDE DATA
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
