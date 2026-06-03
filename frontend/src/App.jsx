import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AquariumPanel } from './segfish.jsx';
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

  // 機能B: ローテーション情報（前/次の担当者）
  const [rotation, setRotation] = useState([]);

  // 機能C: DBからの最終結果メタ（鮮度バッジ用）
  const [lastResultMeta, setLastResultMeta] = useState(null);
  const [lastResultFetched, setLastResultFetched] = useState(false);

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

  // 機能A: 日付・曜日計算
  const todayDate = new Date();
  const dayNamesEn = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  const dayOfWeek = todayDate.getDay();
  const dayNameEn = dayNamesEn[dayOfWeek];
  const dayColor = dayOfWeek === 0 ? '#ff3366' : dayOfWeek === 6 ? '#00ccff' : '#00ffaa';
  const year = todayDate.getFullYear();
  const month = todayDate.getMonth() + 1;
  const day = todayDate.getDate();
  const todayStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

  // 機能C: 鮮度判定（取得完了後のみ判定する）
  const isResultStale = lastResultFetched && (!lastResultMeta?.assignedDate || lastResultMeta.assignedDate !== todayStr);

  const addLog = (msg) => {
    setLogTerminal(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev.slice(0, 7)]);
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

  // 機能B+C: マウント時にDB同期
  useEffect(() => {
    fetchLastResult();
    fetchRotation();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchStatus = async () => {
    try {
      const res = await fetch(`${API_BASE}/status`);
      const data = await res.json();
      const ops = data.operators || [];
      setOperators(ops);
      setQueues(data.queues || { report: [], feedback: [] });
      setPresentIds(ops.map(op => op.id));
    } catch (err) {
      addLog('ERROR: SYSTEM LINK FAILED.');
    }
  };

  // 機能C: DBから最終結果を取得し、ROSTERとメタを更新
  const fetchLastResult = async () => {
    try {
      const res = await fetch(`${API_BASE}/missions/last-result`);
      const data = await res.json();
      setLastResultMeta(data);
      setLastResultFetched(true);
      if (data.assignments && data.assignments.length > 0) {
        const formattedResult = {
          assembly: data.assignments.find(m => m.missionType === 'ASSEMBLY')?.assignedOperators || [],
          report: data.assignments.find(m => m.missionType === 'REPORT')?.assignedOperators || [],
          feedback: data.assignments.find(m => m.missionType === 'FEEDBACK')?.assignedOperators || []
        };
        setResult(formattedResult);
        localStorage.setItem('mission_result', JSON.stringify(formattedResult));
      } else {
        setLastResultFetched(true);
      }
    } catch (err) {
      setLastResultFetched(true);
      addLog('ERROR: DB SYNC FAILED.');
    }
  };

  // 機能B: ローテーション（前/次）を取得
  const fetchRotation = async () => {
    try {
      const res = await fetch(`${API_BASE}/missions/rotation`);
      const data = await res.json();
      setRotation(data || []);
    } catch (_) {}
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

      // 機能C: 鮮度メタを本日付きに更新
      setLastResultMeta(prevMeta => ({
        ...(prevMeta || {}),
        assignedDate: todayStr,
        assignments: data
      }));
      setLastResultFetched(true);

      // 機能B: ローテーション更新
      fetchRotation();

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
      // DBが正（ロールバック後の状態をDBから取得して表示を更新）
      await fetchLastResult();
      await fetchRotation();
      addLog('>> DBから最新状態を復元しました。');
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
      await triggerAllocation(); // triggerAllocation 内で fetchRotation も呼ぶ
    } catch (err) {
      addLog('ERROR: OVERRIDE SYNC FAILED.');
      console.error(err);
    }
  };

  const isTimeOverAlert = timeLeft === 0 && !timerActive && logTerminal[0]?.includes('TIME OVER');

  // 機能C: 鮮度バッジのレンダリング
  const renderFreshnessBadge = () => {
    if (!lastResultFetched) return null;
    const isToday = lastResultMeta?.assignedDate === todayStr;
    const dateLabel = lastResultMeta?.assignedDate
      ? (() => {
          const d = new Date(lastResultMeta.assignedDate + 'T00:00:00');
          return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        })()
      : null;
    if (isToday) {
      return <span className="freshness-pill freshness-pill--ok">&#10003; CONFIRMED {dateLabel}</span>;
    }
    return (
      <span className="freshness-pill freshness-pill--warn">
        &#9888; NOT RUN{dateLabel ? ` · LAST ${dateLabel}` : ''}
      </span>
    );
  };

  // 機能B: カードごとの前/次キャプションレンダリング
  const renderPrevNext = (type) => {
    const rot = rotation.find(r => r.type === type);
    if (!rot) return null;
    const prevName = rot.previous ? displayName(rot.previous) : '---';
    const nextName = rot.next ? displayName(rot.next) : '---';
    return (
      <div className="roster-prevnext">
        <span className="prevnext-item prevnext-item--prev" title={`前回: ${prevName}`}>
          <span className="prevnext-label">&#9664; 前回</span>
          <span className="prevnext-name">{prevName}</span>
        </span>
        <span className="prevnext-item prevnext-item--next" title={`次回: ${nextName}`}>
          <span className="prevnext-label">次回 &#9654;</span>
          <span className="prevnext-name">{nextName}</span>
        </span>
      </div>
    );
  };

  // 機能B+C: ROSTER の確定者1行（出席カードと同じ ID タグで情報密度を統一）
  const renderRosterName = (op) => (
    <div key={op.id} className="roster-name roster-highlight">
      <span className="roster-op-id">{String(op.displayOrder).padStart(2, '0')}</span>
      <span className="roster-op-name">{displayResultName(op)}</span>
    </div>
  );

  const rosterEmpty = <div className="roster-name roster-name--empty">-- ///</div>;

  return (
    <div className={`app-shell ${isTimeOverAlert ? 'time-over-flash' : ''}`}>
      {/* 全画面背景レイヤー: セグメントフィッシュ */}
      <AquariumPanel spawnTrigger={aquariumSpawn} clearTrigger={aquariumClear} storageKey="mission_aquarium_count" />

      <header className="app-header">
        <h1 className="app-title">
          <span className="accent-green">[{'>'}{'>'}]</span> MISSION_MGMNT_SYS <span className="app-subtitle">[SYS_CTRL_v3.00_GAME_MODE]</span>
        </h1>
        {/* 機能A: ISO日付 [曜日]（2026-06-03 [WED]） */}
        <div className="header-date-bar">
          <span className="header-date-text">
            <span className="header-date-iso">{todayStr}</span>
            <span className="header-dow" style={{ color: dayColor }}> [{dayNameEn}]</span>
          </span>
        </div>
        <div className="header-right">
          <div className="fish-ctrl">
            <button type="button" className="fish-btn" onClick={() => setAquariumSpawn(n => n + 1)}>▶ SPAWN</button>
            <button type="button" className="fish-btn fish-btn--clr" onClick={() => setAquariumClear(n => n + 1)}>✕ CLR</button>
          </div>
          <div className="retro-clock" title="現在時刻 (デジタル時計)">
            <span className="clock-dot" />
            <span className="clock-digits">{currentTime}</span>
          </div>
        </div>
      </header>

      <div className="dashboard-grid">

        {/* LEFT COLUMN: ATTENDANCE */}
        <div className="cyber-panel attendance-panel">
          <div>
            <h2 className="panel-heading">:: OPERATORS ATTENDANCE</h2>
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
          </div>
        </div>

        {/* CENTER COLUMN: SHIFT & OPS */}
        <aside className="cyber-panel side-deck" aria-label="シフト状況">
          <div className="side-deck__block">
            <div className="side-deck__heading">:: SHIFT LOAD</div>
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
            <div className="side-deck__heading">:: FIELD OPS</div>
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
            <h3 className="panel-heading panel-heading--warn">:: INTERRUPT QUEUE</h3>
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

      {/* 機能B+C: ROSTER SECTION — 常時表示、鮮度バッジ、前/次キャプション */}
      <div className={`cyber-panel roster-panel${isResultStale ? ' roster-panel--stale' : ''}`}>
        <div className="roster-header">
          <h2 className="panel-heading panel-heading--cyan">:: DAILY ALLOCATION ROSTER</h2>
          {renderFreshnessBadge()}
        </div>
        <div className="roster-grid">
          {/* ASSEMBLY */}
          <div className="roster-card">
            <h3 className="roster-title"><span className="roster-icon roster-icon--assembly">&#9670;</span>ASSEMBLY <span className="roster-slot">&times;1</span></h3>
            <div className="roster-names">
              {result?.assembly?.[0] ? renderRosterName(result.assembly[0]) : rosterEmpty}
            </div>
            {renderPrevNext('ASSEMBLY')}
          </div>
          {/* REPORT */}
          <div className="roster-card">
            <h3 className="roster-title"><span className="roster-icon roster-icon--report">&#9635;</span>REPORT <span className="roster-slot">&times;2</span></h3>
            <div className="roster-names">
              {result?.report?.length > 0
                ? result.report.map(op => renderRosterName(op))
                : rosterEmpty
              }
            </div>
            {renderPrevNext('REPORT')}
          </div>
          {/* FEEDBACK */}
          <div className="roster-card">
            <h3 className="roster-title"><span className="roster-icon roster-icon--feedback">&#9673;</span>FEEDBACK <span className="roster-slot">&times;2</span></h3>
            <div className="roster-names">
              {result?.feedback?.length > 0
                ? result.feedback.map(op => renderRosterName(op))
                : rosterEmpty
              }
            </div>
            {renderPrevNext('FEEDBACK')}
          </div>
        </div>
      </div>

      {/* CONTROLS */}
      <div className="controls-grid">
        <button type="button" className="cyber-btn main-btn" onClick={triggerAllocation}>
          <span className="btn-led btn-led--green" /> :: RUN ALLOCATION SEQUENCE ::
        </button>
        <button type="button" className="cyber-btn cyber-btn--warn" onClick={() => setShowAdmin(true)}>
          <span className="btn-led btn-led--orange" /> EMERGENCY PROTOCOL
        </button>
      </div>

      <footer className="app-footer">
        <span className="footer-status"><span className="accent-green">[SYS_OK]</span> CENTRAL MATRIX ONLINE</span>
        <span className="footer-center">:: MISSION_MGMNT_SYS :: SYS_CTRL_v3.00 ::</span>
        <span className="footer-right">
          <span className="footer-metric">PRESENT <b>{presentIds.length}/{operators.length}</b></span>
          <span className="footer-metric">OPS <b>{opsCount}</b></span>
          <span className="blinking-cursor accent-orange">█</span>
        </span>
      </footer>

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
