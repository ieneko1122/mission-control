/** 月〜金の標準時間割（イレギュラーはオーバーライドで対応） */
export const SCHEDULE_BLOCKS = [
  { id: 'prep', label: 'Lecture Prep', type: 'prep', start: '08:45', end: '09:00' },
  { id: 'morning', label: 'Morning Assembly', type: 'ceremony', start: '09:00', end: '09:40' },
  { id: 'break1', label: '10-min Break', type: 'break', start: '09:40', end: '09:50' },
  { id: 'p1', label: 'Period 1', type: 'class', start: '09:50', end: '10:40' },
  { id: 'break2', label: '10-min Break', type: 'break', start: '10:40', end: '10:50' },
  { id: 'p2', label: 'Period 2', type: 'class', start: '10:50', end: '12:00' },
  { id: 'lunch', label: 'Lunch Break', type: 'lunch', start: '12:00', end: '13:00' },
  { id: 'p3', label: 'Period 3', type: 'class', start: '13:00', end: '13:40' },
  { id: 'break3', label: '10-min Break', type: 'break', start: '13:40', end: '13:50' },
  { id: 'p4', label: 'Period 4', type: 'class', start: '13:50', end: '14:40' },
  { id: 'break4', label: '10-min Break', type: 'break', start: '14:40', end: '14:50' },
  { id: 'p5', label: 'Period 5', type: 'class', start: '14:50', end: '15:40' },
  { id: 'break5', label: '10-min Break', type: 'break', start: '15:40', end: '15:50' },
  { id: 'p6', label: 'Period 6', type: 'class', start: '15:50', end: '16:30' },
  { id: 'break6', label: '10-min Break', type: 'break', start: '16:30', end: '16:40' },
  { id: 'task', label: 'Study Time', type: 'task', start: '16:40', end: '17:30' },
  { id: 'break7', label: '10-min Break', type: 'break', start: '17:30', end: '17:40' },
  { id: 'report', label: 'Daily Wrap-up', type: 'report', start: '17:40', end: '18:00' },
];

export const FREE_LENGTH_OPTIONS = [45, 50, 90];

const OVERRIDE_KEY = 'mission_shift_override';

export function isSchoolDay(date) {
  const day = date.getDay();
  return day >= 1 && day <= 5;
}

export function parseTimeToMs(date, hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  const d = new Date(date);
  d.setHours(h, m, 0, 0);
  return d.getTime();
}

export function getBlocksForDate(date) {
  return SCHEDULE_BLOCKS.map((block, index) => ({
    ...block,
    index,
    startMs: parseTimeToMs(date, block.start),
    endMs: parseTimeToMs(date, block.end),
    rangeLabel: `${block.start}–${block.end}`,
  }));
}

export function findBlockByTime(date, blocks) {
  const now = date.getTime();
  return blocks.find((b) => now >= b.startMs && now < b.endMs) ?? null;
}

export function loadShiftOverride() {
  try {
    const raw = localStorage.getItem(OVERRIDE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function saveShiftOverride(override) {
  localStorage.setItem(OVERRIDE_KEY, JSON.stringify(override));
}

export function defaultOverride(date) {
  return { dateKey: date.toDateString(), mode: 'auto' };
}

export function normalizeOverride(date, override) {
  const base = defaultOverride(date);
  if (!override || override.dateKey !== base.dateKey) return base;
  return { ...base, ...override, dateKey: base.dateKey };
}

/**
 * 現在のブロックとゲージ用の start/end を解決
 */
export function resolveActiveBlock(now, rawOverride) {
  const override = normalizeOverride(now, rawOverride);
  const nowMs = now.getTime();

  if (override.mode === 'free' && override.freeEndMs && nowMs < override.freeEndMs) {
    return {
      id: 'free',
      label: `Free Mode (${override.freeMinutes} min)`,
      type: 'free',
      index: -1,
      startMs: override.freeStartMs,
      endMs: override.freeEndMs,
      rangeLabel: 'Manual',
      source: 'free',
      active: true,
    };
  }

  if (!isSchoolDay(now)) {
    return inactiveBlock('Weekend (Auto Off)', 'off');
  }

  const blocks = getBlocksForDate(now);

  if (override.mode === 'manual' && override.blockIndex != null) {
    const block = blocks[override.blockIndex];
    if (block) {
      const startMs = override.blockStartMs ?? block.startMs;
      const endMs = override.blockEndMs ?? block.endMs;
      if (nowMs < endMs) {
        return {
          ...block,
          startMs,
          endMs,
          source: 'manual',
          active: true,
        };
      }
    }
  }

  const scheduled = findBlockByTime(now, blocks);
  if (scheduled) {
    let endMs = scheduled.endMs;
    if (override.endOverrideIndex === scheduled.index && override.endOverrideMs) {
      endMs = Math.max(endMs, override.endOverrideMs);
    }
    return {
      ...scheduled,
      startMs: scheduled.startMs,
      endMs,
      source: override.endOverrideMs ? 'extended' : 'auto',
      active: true,
    };
  }

  if (nowMs < blocks[0].startMs) {
    return inactiveBlock('Before Hours', 'off', blocks[0]);
  }
  if (nowMs >= blocks[blocks.length - 1].endMs) {
    return inactiveBlock('After Hours', 'off');
  }

  return inactiveBlock('Off Schedule', 'off');
}

function inactiveBlock(label, type, nextBlock = null) {
  return {
    id: 'inactive',
    label,
    type,
    index: -1,
    startMs: null,
    endMs: null,
    rangeLabel: nextBlock ? `Next: ${nextBlock.label} ${nextBlock.start}~` : '—',
    source: 'off',
    active: false,
    nextBlock,
  };
}

export function calcProgress(block, nowMs = Date.now()) {
  if (!block?.active || !block.startMs || !block.endMs) return 0;
  const span = block.endMs - block.startMs;
  if (span <= 0) return 100;
  return Math.min(100, Math.max(0, ((nowMs - block.startMs) / span) * 100));
}

export function calcRemainingMinutes(block, nowMs = Date.now()) {
  if (!block?.active || !block.endMs) return 0;
  return Math.max(0, Math.ceil((block.endMs - nowMs) / 60000));
}

export function buildExtendOverride(now, rawOverride, activeBlock, addMinutes) {
  const override = normalizeOverride(now, rawOverride);
  const addMs = addMinutes * 60 * 1000;
  const newEnd = Math.max(activeBlock.endMs, now.getTime()) + addMs;

  if (override.mode === 'manual') {
    return {
      ...override,
      blockEndMs: newEnd,
    };
  }

  return {
    ...override,
    mode: 'auto',
    endOverrideIndex: activeBlock.index,
    endOverrideMs: newEnd,
  };
}

export function buildSkipOverride(now, rawOverride) {
  const override = normalizeOverride(now, rawOverride);
  const blocks = getBlocksForDate(now);
  const current = resolveActiveBlock(now, override);
  let idx = current.index;

  if (idx < 0) {
    const scheduled = findBlockByTime(now, blocks);
    idx = scheduled ? scheduled.index : -1;
  }

  if (idx < 0 || idx >= blocks.length - 1) return null;

  const next = blocks[idx + 1];
  return {
    dateKey: now.toDateString(),
    mode: 'manual',
    blockIndex: idx + 1,
    blockStartMs: now.getTime(),
    blockEndMs: next.endMs,
  };
}

export function buildFreeOverride(now, minutes) {
  const startMs = now.getTime();
  return {
    dateKey: now.toDateString(),
    mode: 'free',
    freeStartMs: startMs,
    freeEndMs: startMs + minutes * 60 * 1000,
    freeMinutes: minutes,
  };
}

export function sourceLabel(source) {
  switch (source) {
    case 'auto': return 'AUTO';
    case 'extended': return 'EXTENDED';
    case 'manual': return 'MANUAL';
    case 'free': return 'FREE';
    default: return '—';
  }
}
