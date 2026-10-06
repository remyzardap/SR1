import { useServiceWorker } from "@/hooks/useServiceWorker";

export function SWUpdateHandler() {
  useServiceWorker();
  return null;
}