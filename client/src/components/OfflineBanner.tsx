import { useOnline } from "@/hooks/useOnline";
import { OfflineBanner as OfflineBannerComponent } from "@/components/redo/OfflineBanner";

export function OfflineBanner() {
  const isOnline = useOnline();
  
  if (isOnline) return null;
  
  return <OfflineBannerComponent />;
}

export default OfflineBanner;