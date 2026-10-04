'use client';

import { useEffect, useState } from 'react';

export default function PreviewQr() {
  const [joinUrl, setJoinUrl] = useState<string | null>(null);

  useEffect(() => {
    setJoinUrl(new URL('/join', window.location.origin).href);
  }, []);

  if (!joinUrl) return <span className="preview-qr-placeholder" aria-hidden="true" />;

  const imageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&margin=4&data=${encodeURIComponent(joinUrl)}`;
  // eslint-disable-next-line @next/next/no-img-element
  return <img className="preview-qr-image" src={imageUrl} alt={`QR code to join this market at ${joinUrl}`} width={168} height={168} />;
}
