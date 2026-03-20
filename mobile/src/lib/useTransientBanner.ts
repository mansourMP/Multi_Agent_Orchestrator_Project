import { useEffect, useState } from "react";

export type BannerTone = "neutral" | "success" | "error";

export function useTransientBanner(durationMs = 2600) {
  const [banner, setBanner] = useState<{ message: string; tone: BannerTone } | null>(null);

  useEffect(() => {
    if (!banner) return;
    const id = setTimeout(() => setBanner(null), durationMs);
    return () => clearTimeout(id);
  }, [banner, durationMs]);

  const showBanner = (message: string, tone: BannerTone = "neutral") => {
    setBanner({ message, tone });
  };

  return { banner, showBanner };
}
