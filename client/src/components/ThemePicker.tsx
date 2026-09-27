import { useTheme, THEMES } from '../contexts/ThemeContext';
import { Check } from 'lucide-react';

export function ThemePicker() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="px-3 pb-4">
      <p className="label-upper mb-3 px-1">Space Theme</p>
      <div className="grid grid-cols-2 gap-2">
        {THEMES.map((t) => {
          const isActive = t.id === theme.id;
          return (
            <button
              key={t.id}
              onClick={() => setTheme(t)}
              title={t.name}
              style={{
                borderColor: isActive ? t.accentColor : 'rgba(255,255,255,0.08)',
                boxShadow: isActive
                  ? `0 0 16px ${t.accentGlow}, inset 0 1px 0 rgba(255,255,255,0.12)`
                  : 'none',
              }}
              className={[
                'relative overflow-hidden rounded-xl border',
                'transition-all duration-300 cursor-pointer',
                isActive ? 'scale-105' : 'hover:scale-105 hover:border-white/20',
              ].join(' ')}
            >
              <div
                className="h-10 w-full"
                style={{ background: `linear-gradient(135deg, ${t.accentColor}, ${t.secondaryColor})` }}
              />
              <div
                className="px-2 py-1.5 text-center"
                style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(8px)' }}
              >
                <span className="text-[10px] font-semibold tracking-wide text-white/80 leading-none">
                  {t.name}
                </span>
              </div>
              {isActive && (
                <div
                  className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full flex items-center justify-center"
                  style={{ background: t.accentColor }}
                >
                  <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
