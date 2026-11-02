import { useEffect, useRef, useState } from 'react';
import { formatFull, formatValue, METRICS, SUMMARY_LABELS } from '../lib/analytics.js';
import { Icon } from './ui.jsx';

// Validated categorical palette, used in this fixed order. Single-series charts use slot 1.
export const SERIES = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'];
export const OTHER = '#b7b5ae';
// Ordinal blue ramp (steps 250 → 650) for funnel stages: light = early stage, dark = late.
const FUNNEL = ['#86b6ef', '#5598e7', '#2a78d6', '#1c5cab', '#104281'];

function useWidth() {
  const ref = useRef();
  const [w, setW] = useState(480);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(160, Math.floor(e.contentRect.width))));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

// Hover tooltip anchored inside a relatively-positioned chart wrapper.
function useTip() {
  const ref = useRef();
  const [tip, setTip] = useState(null);
  const show = (e, content) => {
    const r = ref.current.getBoundingClientRect();
    setTip({ x: Math.min(e.clientX - r.left + 12, r.width - 150), y: Math.max(e.clientY - r.top - 10, 0), content });
  };
  const node = tip && <div className="an-tip" style={{ left: tip.x, top: tip.y }}>{tip.content}</div>;
  return { ref, show, hide: () => setTip(null), node };
}

const useMounted = () => { const [m, setM] = useState(false); useEffect(() => { const t = requestAnimationFrame(() => setM(true)); return () => cancelAnimationFrame(t); }, []); return m; };

export function niceScale(max) {
  if (!(max > 0)) return { top: 1, ticks: [0, 1] };
  const raw = max / 4, exp = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / exp;
  const step = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * exp;
  const top = Math.ceil(max / step) * step;
  const ticks = []; for (let v = 0; v <= top + step / 2; v += step) ticks.push(v);
  return { top, ticks };
}
const every = (n, max) => Math.max(1, Math.ceil(n / max));

export function Trend({ change, compare, snapshot }) {
  if (snapshot) return <span className="an-muted">As of today</span>;
  if (change == null) return <span className="an-trend up">▲ New</span>;
  const up = change >= 0;
  return <span className="an-trend-wrap"><span className={`an-trend ${up ? 'up' : 'down'}`}>{up ? '▲' : '▼'} {Math.abs(change).toFixed(change % 1 ? 1 : 0)}%</span><span className="an-muted">vs {compare}</span></span>;
}

export function Kpi({ data }) {
  return (
    <div className="an-kpi">
      <div className="an-kpi-value">{formatValue(data.value, data.fmt)}</div>
      <div className="an-kpi-foot">
        <Trend change={data.change} compare={data.compare} snapshot={data.snapshot} />
        {!data.snapshot && data.prev != null && <span className="an-muted">Previous: {formatValue(data.prev, data.fmt)}</span>}
      </div>
    </div>
  );
}

export function Gauge({ data, target }) {
  const mounted = useMounted();
  const t = Number(target) || 1;
  const f = Math.min(1, Math.max(0, data.value / t));
  return (
    <div className="an-gauge">
      <svg viewBox="0 0 220 124" role="img" aria-label={`${formatFull(data.value, data.fmt)} of target ${formatFull(t, data.fmt)}`}>
        <path d="M 20 110 A 90 90 0 0 1 200 110" pathLength="100" className="an-arc-bg" />
        <path d="M 20 110 A 90 90 0 0 1 200 110" pathLength="100" className="an-arc-fg" style={{ strokeDasharray: `${mounted ? f * 100 : 0} 100` }} />
        <g className="an-needle" style={{ transform: `rotate(${mounted ? -90 + f * 180 : -90}deg)` }}><path d="M 110 104 L 110 28 L 114 104 Z" /><circle cx="110" cy="110" r="7" /></g>
      </svg>
      <div className="an-gauge-meta">
        <div><span className="an-muted">Achieved</span><b>{formatFull(data.value, data.fmt)}</b></div>
        <div><span className="an-muted">Target</span><b>{formatFull(t, data.fmt)}</b></div>
        <div><span className="an-muted">Remaining</span><b>{formatFull(Math.max(0, t - data.value), data.fmt)}</b></div>
      </div>
      <div className="an-pct">{Math.round(data.value / t * 100)}% of target</div>
    </div>
  );
}

export function Bullet({ data, target }) {
  const t = Number(target) || 1;
  const { top, ticks } = niceScale(Math.max(t, data.value) * 1.05);
  return (
    <div className="an-bullet">
      <div className="an-bullet-head"><b>{formatFull(data.value, data.fmt)}</b><span className="an-muted">{Math.round(data.value / t * 100)}% of {formatFull(t, data.fmt)} target</span></div>
      <div className="an-bullet-track" role="img" aria-label={`${formatFull(data.value, data.fmt)} against target ${formatFull(t, data.fmt)}`}>
        <div className="an-bullet-fill" style={{ width: `${Math.min(100, data.value / top * 100)}%` }} />
        <div className="an-bullet-mark" style={{ left: `${t / top * 100}%` }}><span>Target {formatValue(t, data.fmt)}</span></div>
      </div>
      <div className="an-bullet-axis">{ticks.map((v) => <span key={v}>{formatValue(v, data.fmt)}</span>)}</div>
    </div>
  );
}

export function BarList({ rows, fmt }) {
  const tip = useTip();
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (!rows.length) return <Nothing />;
  return (
    <div className="an-chart" ref={tip.ref} onMouseLeave={tip.hide}>
      {rows.map((r, i) => (
        <div className="an-hrow" key={r.label} onMouseMove={(e) => tip.show(e, <><b>{r.label}</b><br />{formatFull(r.value, fmt)}</>)}>
          <span className="an-hlabel" title={r.label}>{r.label}</span>
          <div className="an-htrack"><div className="an-hbar" style={{ width: `${Math.max(1.5, r.value / max * 100)}%`, animationDelay: `${i * 50}ms` }} /></div>
          <span className="an-hvalue">{formatValue(r.value, fmt)}</span>
        </div>
      ))}
      {tip.node}
    </div>
  );
}

export function Columns({ rows, fmt }) {
  const tip = useTip();
  if (!rows.length) return <Nothing />;
  const max = Math.max(...rows.map((r) => r.value));
  const { top, ticks } = niceScale(max);
  const skip = every(rows.length, 9);
  const maxI = rows.findIndex((r) => r.value === max);
  return (
    <div className="an-chart an-cols" ref={tip.ref} onMouseLeave={tip.hide}>
      <div className="an-plot">
        {ticks.map((v) => <div key={v} className="an-grid-line" style={{ bottom: `${v / top * 100}%` }}><span>{formatValue(v, fmt)}</span></div>)}
        <div className="an-colset">
          {rows.map((r, i) => (
            <div key={r.label + i} className="an-col-slot" onMouseMove={(e) => tip.show(e, <><b>{r.label}</b><br />{formatFull(r.value, fmt)}</>)}>
              <div className="an-col" style={{ height: `${r.value / top * 100}%`, animationDelay: `${i * 40}ms` }}>{i === maxI && max > 0 && <span className="an-col-label">{formatValue(r.value, fmt)}</span>}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="an-xlabels">{rows.map((r, i) => <span key={r.label + i}>{i % skip === 0 ? r.label : ''}</span>)}</div>
      {tip.node}
    </div>
  );
}

export function LineChart({ rows, fmt }) {
  const tip = useTip();
  const [wrapRef, w] = useWidth();
  const [hover, setHover] = useState(null);
  if (!rows.length) return <Nothing />;
  const H = 210, padL = 54, padR = 16, padT = 14, padB = 26;
  const { top, ticks } = niceScale(Math.max(...rows.map((r) => r.value)));
  const x = (i) => (rows.length === 1 ? (padL + w - padR) / 2 : padL + (i / (rows.length - 1)) * (w - padL - padR));
  const y = (v) => padT + (1 - v / top) * (H - padT - padB);
  const line = rows.map((r, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(r.value).toFixed(1)}`).join(' ');
  const area = `${line} L${x(rows.length - 1).toFixed(1)} ${H - padB} L${x(0).toFixed(1)} ${H - padB} Z`;
  const skip = every(rows.length, Math.max(3, Math.floor(w / 80)));
  const move = (e) => {
    const r = e.currentTarget.getBoundingClientRect();
    const i = Math.round(((e.clientX - r.left - padL) / (w - padL - padR)) * (rows.length - 1));
    const k = Math.min(rows.length - 1, Math.max(0, i));
    setHover(k); tip.show(e, <><b>{rows[k].label}</b><br />{formatFull(rows[k].value, fmt)}</>);
  };
  const last = rows.length - 1;
  return (
    <div className="an-chart" ref={(el) => { wrapRef.current = el; tip.ref.current = el; }}>
      <svg width={w} height={H} onMouseMove={move} onMouseLeave={() => { setHover(null); tip.hide(); }} role="img" aria-label="Line chart">
        {ticks.map((v) => <g key={v}><line x1={padL} x2={w - padR} y1={y(v)} y2={y(v)} className="an-gl" /><text x={padL - 8} y={y(v) + 4} textAnchor="end" className="an-tick">{formatValue(v, fmt)}</text></g>)}
        {rows.map((r, i) => i % skip === 0 && <text key={i} x={x(i)} y={H - 6} textAnchor="middle" className="an-tick">{r.label}</text>)}
        <path d={area} className="an-area" />
        <path d={line} className="an-line" pathLength="1" />
        {hover != null && <line x1={x(hover)} x2={x(hover)} y1={padT} y2={H - padB} className="an-cross" />}
        <circle cx={x(hover ?? last)} cy={y(rows[hover ?? last].value)} r="4" className="an-dot" />
      </svg>
      {tip.node}
    </div>
  );
}

export function Donut({ rows, fmt }) {
  const mounted = useMounted();
  const [active, setActive] = useState(null);
  const total = rows.reduce((s, r) => s + r.value, 0);
  if (!rows.length || !total) return <Nothing />;
  const top = rows.slice(0, 6);
  const rest = rows.slice(6).reduce((s, r) => s + r.value, 0);
  const parts = rest > 0 ? [...top, { label: 'Other', value: rest, other: true }] : top;
  let cum = 0;
  return (
    <div className="an-donut">
      <div className="an-donut-svg">
        <svg viewBox="0 0 100 100" role="img" aria-label="Donut chart">
          <circle cx="50" cy="50" r="38" className="an-donut-bg" />
          {parts.map((p, i) => {
            const pct = p.value / total * 100; const off = cum; cum += pct;
            return <circle key={p.label} cx="50" cy="50" r="38" pathLength="100" className="an-seg" transform="rotate(-90 50 50)"
              style={{ stroke: p.other ? OTHER : SERIES[i], opacity: active == null || active === i ? 1 : 0.25, strokeDasharray: `${mounted ? Math.max(pct - 0.9, 0.2) : 0} 100`, strokeDashoffset: -off, transitionDelay: `${i * 70}ms` }}
              onMouseEnter={() => setActive(i)} onMouseLeave={() => setActive(null)} />;
          })}
        </svg>
        <div className="an-donut-center"><b>{formatValue(active != null ? parts[active].value : total, fmt)}</b><span>{active != null ? parts[active].label : 'Total'}</span></div>
      </div>
      <ul className="an-legend">
        {parts.map((p, i) => (
          <li key={p.label} onMouseEnter={() => setActive(i)} onMouseLeave={() => setActive(null)} className={active === i ? 'on' : ''}>
            <i style={{ background: p.other ? OTHER : SERIES[i] }} /><span className="grow">{p.label}</span><b>{formatValue(p.value, fmt)}</b><em>{Math.round(p.value / total * 100)}%</em>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Funnel({ rows, fmt }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (!rows.some((r) => r.value)) return <Nothing />;
  return (
    <div className="an-funnel">
      {rows.map((r, i) => (
        <div key={r.label} className="an-frow">
          <span className="an-flabel">{r.label}</span>
          <div className="an-ftrack"><div className="an-fbar" style={{ width: `${Math.max(6, r.value / max * 100)}%`, background: FUNNEL[Math.min(i, FUNNEL.length - 1)], animationDelay: `${i * 90}ms` }} /></div>
          <span className="an-fvalue"><b>{formatValue(r.value, fmt)}</b>{r.count != null && <em>{r.count} deal{r.count === 1 ? '' : 's'}</em>}</span>
        </div>
      ))}
    </div>
  );
}

export function DataTable({ rows, fmt, compact }) {
  const total = rows.reduce((s, r) => s + r.value, 0);
  if (!rows.length) return <Nothing />;
  return (
    <table className="t an-table"><thead><tr><th>Name</th><th className="num">Value</th>{!compact && <th className="num">Share</th>}</tr></thead>
      <tbody>{rows.map((r) => <tr key={r.label}><td>{r.label}</td><td className="num">{formatFull(r.value, fmt)}</td>{!compact && <td className="num">{total ? Math.round(r.value / total * 100) : 0}%</td>}</tr>)}</tbody></table>
  );
}

// Month-wise or year-wise performance: one row per period, change versus the previous period on revenue.
export function SummaryTable({ data }) {
  const rows = data.rows;
  const max = Math.max(1, ...rows.map((r) => r.values[0]));
  const best = rows.reduce((b, r, i) => (r.values[0] > (rows[b]?.values[0] || 0) ? i : b), 0);
  const totals = data.cols.map((_, ci) => rows.reduce((s, r) => s + r.values[ci], 0));
  return (
    <div className="table-wrap">
      <table className="t an-summary">
        <thead><tr><th>Period</th>{data.cols.map((id) => <th key={id} className="num">{SUMMARY_LABELS[id]}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => {
          const prev = rows[i - 1];
          const ch = prev && !r.partial && prev.values[0] ? (r.values[0] - prev.values[0]) / prev.values[0] * 100 : null;
          return (
            <tr key={r.label} className={r.partial ? 'partial' : ''}>
              <td className="strong">{r.label}{r.partial && <span className="badge blue" style={{ marginLeft: 6 }}>so far</span>}{i === best && rows.length > 2 && <span className="badge gold" style={{ marginLeft: 6 }}>Best</span>}</td>
              {data.cols.map((id, ci) => (
                <td key={id} className="num">
                  {ci === 0 ? (
                    <div className="rev-cell"><span>{formatValue(r.values[0], METRICS[id].fmt)}{ch != null && <em className={ch >= 0 ? 'up' : 'down'}>{ch >= 0 ? '▲' : '▼'}{Math.abs(ch).toFixed(0)}%</em>}</span><i style={{ width: `${r.values[0] / max * 100}%` }} /></div>
                  ) : formatValue(r.values[ci], METRICS[id].fmt)}
                </td>
              ))}
            </tr>
          );
        })}</tbody>
        <tfoot><tr><td>Total</td>{data.cols.map((id, ci) => <td key={id} className="num">{formatValue(totals[ci], METRICS[id].fmt)}</td>)}</tr></tfoot>
      </table>
    </div>
  );
}

export function Nothing({ text = 'No data for this period' }) { return <div className="an-empty"><Icon name="chart" />{text}</div>; }
