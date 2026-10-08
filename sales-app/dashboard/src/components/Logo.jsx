// DTA logo as inline SVG: sharp at any size, and the white tile keeps the navy readable in dark mode too.
// variant "mark" = the D-arrow-A symbol only (small spaces); "full" adds the DIGITAL · TRADING · ACCOUNTS line.
const NAVY = '#052c65';

export function LogoShapes(){
  return (
    <g fill={NAVY}>
      {/* top bar, split by the arrow's V-channel */}
      <polygon points="527,211 665,211 608,331 527,331" />
      <polygon points="763,211 912,211 912,331 828,331" />
      <polygon points="686,190 755,190 720,228" />
      {/* arrow head + stem */}
      <polygon points="630,331 720,243 810,331" />
      <rect x="668" y="331" width="103" height="679" />
      {/* D */}
      <path fillRule="evenodd" d="M668 452 H555 C375 452 272 585 272 732 C272 885 385 1010 560 1010 H771 V452 Z M651 549 H570 C450 549 385 630 385 730 C385 830 450 911 570 911 H651 Z" />
      {/* A */}
      <path fillRule="evenodd" d="M933 460 H1060 L1262 1011 H1145 L1108 900 H880 L845 1011 H727 L771 890 Z M995 581 L1076 815 H912 Z" />
    </g>
  );
}

export default function Logo({ variant = 'mark', width = 44, tile = true, className = '' }){
  const full = variant === 'full';
  const vb = full ? '250 170 1050 1010' : '250 170 1050 860';
  const h = Math.round(width * (full ? 1010 : 860) / 1050);
  return (
    <span className={'logo' + (tile ? ' logo-tile' : '') + ' ' + className} style={{ width: tile ? width + 16 : width }}>
      <svg viewBox={vb} width={width} height={h} role="img" aria-label="DTA — Digital Trading Accounts">
        <LogoShapes />
        {full && (
          <g fill={NAVY}>
            <rect x="280" y="1037" width="999" height="18" />
            <rect x="280" y="1143" width="999" height="18" />
            <text x="340" y="1122" fontSize="62" fontWeight="500" textLength="912" lengthAdjust="spacingAndGlyphs"
              fontFamily="Poppins, Montserrat, 'Public Sans', Arial, sans-serif">DIGITAL – TRADING – ACCOUNTS</text>
          </g>
        )}
      </svg>
    </span>
  );
}
