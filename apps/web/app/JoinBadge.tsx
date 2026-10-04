import PreviewQr from './PreviewQr';

export default function JoinBadge() {
  if (process.env.VERCEL_ENV !== 'production') {
    return <div className="preview-join"><PreviewQr /><a className="preview-join-link" href="/join">Join this market ↗</a></div>;
  }
  return (
    <a className="qr-badge" href="/join" aria-label="Scan to trade, join in 15 seconds">
      <span className="qr-badge-code">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/join-qr.svg" alt="QR code for the-pit-seven.vercel.app/join" width={112} height={112} />
      </span>
      <span className="qr-badge-copy">
        <b>Scan to trade</b>
        <span>Join in 15 seconds</span>
        <small>the-pit-seven.vercel.app/join</small>
      </span>
    </a>
  );
}
