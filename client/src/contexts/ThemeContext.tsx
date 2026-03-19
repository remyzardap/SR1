import { createContext, useContext, useState, type ReactNode } from 'react';

export interface ColorTheme {
  id: string;
  name: string;
  background: string;
  color: string;
  accentColor: string;
  secondaryColor: string;
  accentGlow: string;
}

export const THEMES: ColorTheme[] = [
  { id: 'dark', name: 'Dark', background: '#0d0a1a', color: '#f5f2ed', accentColor: '#a78bfa', secondaryColor: '#6d28d9', accentGlow: 'rgba(167,139,250,0.25)' },
  { id: 'light', name: 'Light', background: '#ffffff', color: '#000000', accentColor: '#7c3aed', secondaryColor: '#4f46e5', accentGlow: 'rgba(124,58,237,0.20)' },
  { id: 'midnight', name: 'Midnight', background: '#080818', color: '#e0ddd8', accentColor: '#60a5fa', secondaryColor: '#2563eb', accentGlow: 'rgba(96,165,250,0.25)' },
  { id: 'ember', name: 'Ember', background: '#1a0a0a', color: '#f5e6d8', accentColor: '#f97316', secondaryColor: '#dc2626', accentGlow: 'rgba(249,115,22,0.25)' },
];

interface ThemeContextValue {
  theme: ColorTheme;
  setTheme: (t: ColorTheme) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

export const ThemeProvider = ({ children }: { children: ReactNode }) => {
  const [theme, setTheme] = useState<ColorTheme>(THEMES[0]);

  const toggleTheme = () => {
    setTheme(prev => (prev.id === 'dark' ? THEMES[1] : THEMES[0]));
  };

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
