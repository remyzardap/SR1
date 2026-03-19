import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { trpc } from "@/lib/trpc";

// ─── Types ────────────────────────────────────────────────────────────────────
export interface Business {
  id: number;
  ownerId: number;
  name: string;
  currency: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface BusinessContextValue {
  /** All businesses owned by the current user */
  businesses: Business[];
  /** The currently active/selected business (null = no business selected) */
  activeBusiness: Business | null;
  /** Set the active business (persisted to localStorage) */
  setActiveBusiness: (biz: Business | null) => void;
  /** True while the initial list is loading */
  isLoading: boolean;
  /** Refetch the business list */
  refetch: () => void;
}

const BusinessContext = createContext<BusinessContextValue>({
  businesses: [],
  activeBusiness: null,
  setActiveBusiness: () => {},
  isLoading: false,
  refetch: () => {},
});

const STORAGE_KEY = "sutaeru-active-business-id";

export function BusinessProvider({ children }: { children: ReactNode }) {
  const { data, isLoading, refetch } = trpc.businesses.list.useQuery(undefined, {
    staleTime: 30_000,
  });

  const businesses: Business[] = (data ?? []) as Business[];

  const [activeBusiness, setActiveBusinessState] = useState<Business | null>(() => {
    // Restore from localStorage on first render — resolved against real data later
    return null;
  });

  // Once data loads, restore the saved active business
  useEffect(() => {
    if (!businesses.length) return;
    try {
      const savedId = localStorage.getItem(STORAGE_KEY);
      if (savedId) {
        const found = businesses.find((b) => b.id === parseInt(savedId, 10));
        if (found) {
          setActiveBusinessState(found);
          return;
        }
      }
    } catch {}
    // Default: auto-select the first business if only one exists
    if (businesses.length === 1) {
      setActiveBusinessState(businesses[0]);
    }
  }, [businesses.length]);

  const setActiveBusiness = (biz: Business | null) => {
    setActiveBusinessState(biz);
    try {
      if (biz) {
        localStorage.setItem(STORAGE_KEY, String(biz.id));
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
    } catch {}
  };

  return (
    <BusinessContext.Provider
      value={{ businesses, activeBusiness, setActiveBusiness, isLoading, refetch }}
    >
      {children}
    </BusinessContext.Provider>
  );
}

export function useBusiness() {
  return useContext(BusinessContext);
}
