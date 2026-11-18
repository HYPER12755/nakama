import { useEffect, useState } from "react";
import { assetUrl } from "@moongames/game-sdk";

/** An image from the bundle that works on the web and in a native WebView. */
export function ArtImage({
  src,
  alt,
  className,
}: {
  src: string;
  alt?: string;
  className?: string;
}) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setUrl(null);
    void assetUrl(src)
      .then((resolved) => {
        if (alive) {
          setUrl(resolved);
        }
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [src]);

  return url === null ? (
    <span className={className} aria-hidden="true" />
  ) : (
    <img src={url} alt={alt ?? ""} className={className} loading="lazy" />
  );
}
