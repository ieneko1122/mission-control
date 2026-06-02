/**
 * segfish.jsx — Segment Fish Aquarium
 *
 * 流用方法:
 *   import { AquariumPanel } from './segfish';
 *   <AquariumPanel spawnTrigger={n} clearTrigger={m} />
 *
 * Props:
 *   spawnTrigger  {number}  変化するたびに1体追加
 *   clearTrigger  {number}  変化するたびに全消去
 *   storageKey    {string}  localStorage キー (デフォルト: 'segfish_count')
 *   colors        {string[]} カラーパレット (デフォルト: AQ_COLORS)
 *   segSizes      {number[]} セグメントサイズ配列 (デフォルト: [6,13,9,6,3])
 *   segSpacing    {number}  セグメント間距離px (デフォルト: 14)
 *   maxCount      {number}  最大個体数 (デフォルト: 50)
 */
import { useEffect, useRef } from 'react';

const DEFAULT_COLORS = [
  '#00ffff', '#00ddff', '#3399ff', '#0055ff',
  '#6644ff', '#aa44ff', '#ff44cc', '#ff2255',
  '#ff4400', '#ff8800', '#ffcc00', '#aaff00',
  '#00ff66', '#00ffaa',
];
const DEFAULT_SEG_SIZES = [6, 13, 9, 6, 3];
const DEFAULT_SEG_SPACING = 14;
const DEFAULT_STORAGE_KEY = 'segfish_count';

function buildTrailMax(segSizes, segSpacing) {
  // ドリフト中に低速点が高速点を押し出してtrailピクセル長が縮むため大きめのバッファを確保する
  return (segSizes.length - 1) * segSpacing + 400;
}

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

function aqMake(W, H, mature, { colors, segSizes, segSpacing }) {
  const trailMax = buildTrailMax(segSizes, segSpacing);
  const angle = Math.random() * Math.PI * 2;
  const x = 40 + Math.random() * Math.max(1, W - 80);
  const y = 40 + Math.random() * Math.max(1, H - 80);
  const rv = Math.random();
  let speedType, type, baseSpeed, turnRate;
  if (rv < 0.25) {
    speedType = 'idle';   type = 'square'; baseSpeed = 0.22 + Math.random() * 0.14; turnRate = 0.030;
  } else if (rv < 0.75) {
    speedType = 'cruise'; type = 'circle'; baseSpeed = 0.40 + Math.random() * 0.35; turnRate = 0.032;
  } else {
    speedType = 'active'; type = 'kite';   baseSpeed = 0.90 + Math.random() * 0.70; turnRate = 0.055;
  }
  // trail が全セグメントをカバーできる最小 step を保証する
  const minStep = (segSizes.length - 1) * segSpacing / (trailMax + 9);
  const step = Math.max(mature ? baseSpeed : 0.05, minStep);
  const trail = Array.from({ length: trailMax + 10 }, (_, i) => ({
    x: x - Math.cos(angle) * i * step,
    y: y - Math.sin(angle) * i * step,
  }));
  return {
    id: Math.random(), x, y, angle, targetAngle: angle,
    baseSpeed, turnRate, speedType,
    state: 'gliding',
    glideTimer: Math.floor(Math.random() * 40),
    coastSpeed: 0, driftFrames: 0,
    burstMult: 1, burstFrames: 0, burstRamp: 0,
    pivotRate: 0.05,
    angVel: 0,
    swimPhase: Math.random() * 200,
    fadeIn: mature ? 1 : 0,
    type, color: colors[Math.floor(Math.random() * colors.length)], trail,
  };
}

export function AquariumPanel({
  spawnTrigger,
  clearTrigger,
  storageKey = DEFAULT_STORAGE_KEY,
  colors = DEFAULT_COLORS,
  segSizes = DEFAULT_SEG_SIZES,
  segSpacing = DEFAULT_SEG_SPACING,
  maxCount = 50,
}) {
  const canvasRef = useRef(null);
  const creaturesRef = useRef([]);
  const animRef = useRef(null);
  const wRef = useRef(window.innerWidth);
  const hRef = useRef(window.innerHeight);
  const cfgRef = useRef({ colors, segSizes, segSpacing });
  const trailMax = buildTrailMax(segSizes, segSpacing);

  useEffect(() => {
    if (spawnTrigger === 0) return;
    if (creaturesRef.current.length >= maxCount) return;
    creaturesRef.current.push(aqMake(wRef.current, hRef.current, false, cfgRef.current));
    localStorage.setItem(storageKey, String(creaturesRef.current.length));
  }, [spawnTrigger]);

  useEffect(() => {
    if (clearTrigger === 0) return;
    creaturesRef.current = [];
    localStorage.setItem(storageKey, '0');
  }, [clearTrigger]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
      wRef.current = window.innerWidth;
      hRef.current = window.innerHeight;
      canvas.width = wRef.current;
      canvas.height = hRef.current;
    };
    resize();
    window.addEventListener('resize', resize);

    const ctx = canvas.getContext('2d');

    const saved = parseInt(localStorage.getItem(storageKey) || '0', 10);
    creaturesRef.current = Array.from(
      { length: Math.min(saved, maxCount) },
      () => aqMake(wRef.current, hRef.current, true, cfgRef.current),
    );

    const loop = () => {
      const W = wRef.current;
      const H = hRef.current;
      ctx.clearRect(0, 0, W, H);

      for (const c of creaturesRef.current) {
        if (c.fadeIn < 1) c.fadeIn = Math.min(1, c.fadeIn + 1 / 90);

        c.swimPhase += c.speedType === 'active' ? 1.4 : c.speedType === 'cruise' ? 1.0 : 0.7;
        const speedWave = 1 + 0.15 * Math.sin(c.swimPhase * 0.05);

        const margin = 60;
        const isNearWall = c.x < margin || c.x > W - margin || c.y < margin || c.y > H - margin;

        let moveSpeed = 0;
        let activeTurnRate = c.turnRate;

        switch (c.state) {

          case 'gliding': {
            if (c.glideTimer > 0) c.glideTimer--;

            if (isNearWall) {
              let pushX = 0, pushY = 0;
              if (c.x < margin) pushX += 1;
              if (c.x > W - margin) pushX -= 1;
              if (c.y < margin) pushY += 1;
              if (c.y > H - margin) pushY -= 1;
              const awayAngle = Math.atan2(pushY, pushX);
              const spread = c.speedType === 'idle' ? 0.5 : 0.7;
              c.targetAngle = awayAngle + (Math.random() - 0.5) * spread;
              c.glideTimer = 30 + Math.floor(Math.random() * 30);
            } else if (c.glideTimer === 0) {
              const driftChance = c.speedType === 'idle' ? 0.022
                : c.speedType === 'cruise' ? 0.012 : 0.014;
              if (Math.random() < driftChance) {
                c.state = 'drifting';
                c.coastSpeed = c.baseSpeed * speedWave;
                c.driftFrames = 70 + Math.floor(Math.random() * 110);
                break;
              }
              if (Math.random() < 0.04) {
                const drift = c.speedType === 'idle' ? 0.025 : c.speedType === 'cruise' ? 0.04 : 0.06;
                c.targetAngle += (Math.random() - 0.5) * drift;
                c.glideTimer = 60 + Math.floor(Math.random() * 60);
              }
            }
            moveSpeed = c.baseSpeed * speedWave;
            break;
          }

          case 'drifting': {
            if (c.driftFrames <= 0 || c.coastSpeed < 0.025 || isNearWall) {
              c.coastSpeed = 0;
              if (!isNearWall) {
                const rv = Math.random();
                if (rv < 0.25) {
                  c.state = 'bursting';
                  c.burstMult = 2.2 + Math.random() * 1.0;
                  c.burstFrames = 30 + Math.floor(Math.random() * 40);
                  c.burstRamp = 0;
                } else if (rv < 0.75) {
                  c.state = 'pivoting';
                  const sign = Math.random() < 0.5 ? 1 : -1;
                  const amt = Math.PI * 0.3 + Math.random() * Math.PI * 0.5;
                  c.targetAngle = c.angle + sign * amt;
                  c.pivotRate = 0.09 + Math.random() * 0.05;
                } else {
                  c.state = 'gliding';
                  c.glideTimer = 20 + Math.floor(Math.random() * 30);
                }
              } else {
                c.state = 'gliding';
                c.glideTimer = 15;
                const spread = c.speedType === 'idle' ? 0.25 : 0.45;
                c.targetAngle = Math.atan2(H / 2 - c.y, W / 2 - c.x) + (Math.random() - 0.5) * spread;
              }
              moveSpeed = 0;
            } else {
              c.driftFrames--;
              c.coastSpeed *= 0.988;
              moveSpeed = c.coastSpeed;
            }
            break;
          }

          case 'bursting': {
            c.burstFrames--;
            if (c.burstFrames <= 0 || isNearWall) {
              c.state = 'gliding';
              c.glideTimer = 15 + Math.floor(Math.random() * 25);
            }
            activeTurnRate = c.turnRate * 0.5;
            c.burstRamp = Math.min(1, (c.burstRamp || 0) + 0.05);
            const burstMin = c.speedType === 'idle' ? 0.80 : c.speedType === 'cruise' ? 1.10 : 1.50;
            const burstTarget = Math.max(c.baseSpeed * (c.burstMult || 2.2), burstMin);
            moveSpeed = c.baseSpeed * speedWave + (burstTarget - c.baseSpeed * speedWave) * c.burstRamp;
            break;
          }

          case 'pivoting': {
            moveSpeed = c.baseSpeed * 0.18;
            activeTurnRate = c.pivotRate || 0.10;

            if (isNearWall) {
              c.state = 'gliding';
              c.glideTimer = 30;
              const spread = c.speedType === 'idle' ? 0.25 : 0.45;
              c.targetAngle = Math.atan2(H / 2 - c.y, W / 2 - c.x) + (Math.random() - 0.5) * spread;
              break;
            }
            let pvDiff = c.targetAngle - c.angle;
            while (pvDiff > Math.PI) pvDiff -= Math.PI * 2;
            while (pvDiff < -Math.PI) pvDiff += Math.PI * 2;
            if (Math.abs(pvDiff) < 0.06) {
              if (Math.random() < 0.35) {
                c.state = 'bursting';
                c.burstMult = 1.5 + Math.random() * 0.7;
                c.burstFrames = 25 + Math.floor(Math.random() * 35);
                c.burstRamp = 0;
              } else {
                c.state = 'gliding';
                c.glideTimer = 15 + Math.floor(Math.random() * 25);
              }
            }
            break;
          }
        }

        let diff = c.targetAngle - c.angle;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        const angForce = Math.sign(diff) * Math.min(Math.abs(diff) * 0.22, activeTurnRate);
        c.angVel = c.angVel * 0.78 + angForce;
        c.angVel = Math.max(-activeTurnRate * 1.4, Math.min(activeTurnRate * 1.4, c.angVel));
        c.angle += c.angVel;
        let newDiff = c.targetAngle - c.angle;
        while (newDiff > Math.PI) newDiff -= Math.PI * 2;
        while (newDiff < -Math.PI) newDiff += Math.PI * 2;
        if (diff !== 0 && Math.sign(newDiff) !== Math.sign(diff)) {
          c.angle = c.targetAngle;
          c.angVel = 0;
        }

        c.x = Math.max(15, Math.min(W - 15, c.x + Math.cos(c.angle) * moveSpeed));
        c.y = Math.max(15, Math.min(H - 15, c.y + Math.sin(c.angle) * moveSpeed));

        const _lp = c.trail[0];
        if (!_lp || Math.hypot(c.x - _lp.x, c.y - _lp.y) >= Math.max(0.1, c.baseSpeed * 0.4)) {
          c.trail.unshift({ x: c.x, y: c.y });
          if (c.trail.length > trailMax + 10) c.trail.pop();
        }

        for (let i = segSizes.length - 1; i >= 0; i--) {
          const pt = aqBodyPt(c.trail, i * segSpacing);
          ctx.save();
          ctx.translate(pt.x, pt.y);
          ctx.rotate(pt.angle);
          ctx.globalAlpha = (0.55 + (segSizes.length - 1 - i) * 0.09) * c.fadeIn;
          aqDrawSeg(ctx, c.type, segSizes[i], c.color);
          if (i === 0) {
            const hR = segSizes[0]; const eR = 1.6;
            ctx.shadowColor = '#ffffff'; ctx.shadowBlur = 4;
            ctx.fillStyle = '#ffffff'; ctx.globalAlpha = 0.95 * c.fadeIn;
            ctx.beginPath(); ctx.arc(hR * 0.5, hR * 0.6, eR, 0, Math.PI * 2); ctx.fill();
            ctx.beginPath(); ctx.arc(hR * 0.5, -hR * 0.6, eR, 0, Math.PI * 2); ctx.fill();
          }
          ctx.restore();
        }
      }
      animRef.current = requestAnimationFrame(loop);
    };
    loop();
    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return <canvas ref={canvasRef} className="aquarium-canvas-global" />;
}
