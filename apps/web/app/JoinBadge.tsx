import PreviewQr from './PreviewQr';

export default function JoinBadge() {
  return (
    <div className="preview-join">
      {process.env.VERCEL_ENV === 'production' ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img className="preview-qr-image" src="/join-qr.svg" alt="QR code to join this market" width={168} height={168} />
      ) : <PreviewQr />}
      <a className="preview-join-link" href="/join">Join this market ↗</a>
    </div>
  );
}
