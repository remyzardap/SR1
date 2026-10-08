import { useSeoMeta } from "@/hooks/useSeoMeta";
import { Landing } from "@/components/redo/Landing";

export default function LandingPage() {
  useSeoMeta({ title: "Sutaeru: ask once, Sutaeru does the rest", path: "/", appendSiteName: false });

  return <Landing />;
}