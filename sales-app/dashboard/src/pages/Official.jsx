import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { useApp } from '../state/AppContext.jsx';

const ITEMS = [
  { key: 'website', title: 'DTA Website', hint: 'dtaonline.in' },
  { key: 'mapTezpur', title: 'Tezpur Office — Google Maps', hint: 'Open the exact office location' },
  { key: 'mapBangalore', title: 'Bangalore Office — Google Maps', hint: 'Open the exact office location' },
  { key: 'instagram', title: 'Instagram — Official Profile', hint: 'DTA on Instagram' },
];

function Qr({ url }){
  const [svg, setSvg] = useState('');
  useEffect(() => { QRCode.toString(url, { type: 'svg', margin: 1, width: 150, errorCorrectionLevel: 'L' }).then(setSvg).catch(() => setSvg('')); }, [url]);
  return svg ? <div className="qr" aria-label="QR code" dangerouslySetInnerHTML={{ __html: svg }} /> : null;
}

export default function Official(){
  const { user, call, showToast } = useApp();
  const isAdmin = user.role === 'admin';
  const [links, setLinks] = useState(null);
  const [edit, setEdit] = useState(null);

  useEffect(() => { call('getOfficialLinks').then((d) => setLinks(d.links)).catch((e) => showToast(e.message, 'err')); }, [call, showToast]);

  const copy = (text, msg = 'Link copied.') => navigator.clipboard?.writeText(text).then(() => showToast(msg)).catch(() => showToast('Could not copy.', 'err'));
  const all = () => ITEMS.filter((i) => links?.[i.key]).map((i) => `${i.title}: ${links[i.key]}`).join('\n');
  function save(e){
    e.preventDefault();
    call('setOfficialLinks', edit).then((d) => { setLinks(d.links); setEdit(null); showToast('Official links saved.'); }).catch((err) => showToast(err.message, 'err'));
  }

  if (!links) return <div className="muted">Loading…</div>;
  return (
    <div className="page">
      <header className="page-head"><h1>Official DTA links</h1>
        <div className="row-gap">
          {all() && <button className="btn" onClick={() => copy(all(), 'All details copied — paste in WhatsApp.')}>Copy all (for WhatsApp)</button>}
          {isAdmin && <button className="btn primary" onClick={() => setEdit({ ...links })}>Edit links</button>}
        </div>
      </header>
      <p className="muted" style={{ margin: 0 }}>Our official website, office locations and Instagram profile. Open one to show it to a customer on a video call, share the link, or let them scan the QR code.</p>
      <div className="grid2">
        {ITEMS.map((i) => {
          const url = links[i.key];
          return (
            <section className="card official" key={i.key}>
              <h3>{i.title}</h3>
              {url ? (
                <>
                  <div className="official-body">
                    <div>
                      <a className="official-url" href={url} target="_blank" rel="noopener noreferrer">{url.replace(/^https:\/\//, '')}</a>
                      <div className="row-gap" style={{ marginTop: 10 }}>
                        <a className="btn primary" href={url} target="_blank" rel="noopener noreferrer">Open</a>
                        <button className="btn" onClick={() => copy(url)}>Copy link</button>
                      </div>
                    </div>
                    <Qr url={url} />
                  </div>
                </>
              ) : (
                <p className="muted">{isAdmin ? 'Not added yet — use “Edit links” to paste it.' : 'Not added yet — your admin will add it.'}</p>
              )}
            </section>
          );
        })}
      </div>

      {edit && (
        <div className="modal-back" onMouseDown={(e) => { if (e.target === e.currentTarget) setEdit(null); }}>
          <div className="card modal wide" role="dialog" aria-modal="true" aria-label="Edit official links">
            <div className="modal-head"><h2>Edit official links</h2><button className="btn ghost" onClick={() => setEdit(null)} aria-label="Close">✕</button></div>
            <form className="form-grid" onSubmit={save}>
              {ITEMS.map((i) => (
                <label className="span2" key={i.key}>{i.title}
                  <input type="url" placeholder="https://…" value={edit[i.key] || ''} onChange={(e) => setEdit({ ...edit, [i.key]: e.target.value })} />
                </label>))}
              <p className="span2 muted small" style={{ margin: 0 }}>Paste the full link (it must start with https://). For the office maps: open the office in Google Maps → Share → Copy link. Leave a box empty to hide it.</p>
              <div className="span2 actions"><button type="button" className="btn ghost" onClick={() => setEdit(null)}>Cancel</button><button className="btn primary">Save</button></div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
