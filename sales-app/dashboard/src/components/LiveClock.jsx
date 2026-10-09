import { useEffect, useState } from 'react';

// Live date and time (India time), ticking every second.
const DATE = new Intl.DateTimeFormat('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' });
const TIME = new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' });

export default function LiveClock(){
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const id = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(id); }, []);
  return (
    <div className="live-clock" aria-label="Current date and time">
      <span className="live-dot" aria-hidden="true" />
      <span className="live-date">{DATE.format(now)}</span>
      <span className="live-time tabular">{TIME.format(now).toUpperCase()}</span>
      <span className="live-tz">IST</span>
    </div>
  );
}
