// ============================================
// UPDATED FILE: client/src/os/Block.tsx
// Card visuals match Debtrix/AKIRA/MagicDraft references
// Animations from the block spec (pinch, expand, basket)
// ============================================

import { useRef, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Minimize2, Pin, X } from 'lucide-react';
import { type BlockConfig } from './blockRegistry';
import { usePinchGesture } from './hooks/usePinchGesture';

type BlockState = 'widget' | 'fullscreen' | 'minimized';

interface BlockProps {
  config: BlockConfig;
  widgetContent: React.ReactNode;
  fullscreenContent: React.ReactNode;
  onMinimize?: (blockId: string) => void;
  isBlurred?: boolean;
}

export default function Block({
  config, widgetContent, fullscreenContent, onMinimize, isBlurred,
}: BlockProps) {
  const [state, setState] = useState<BlockState>('widget');
  const [originRect, setOriginRect] = useState<DOMRect | null>(null);
  const [contextMenu, setContextMenu] = useState(false);
  const blockRef = useRef<HTMLDivElement>(null);

  usePinchGesture(blockRef, {
    onPinch: () => { setState('minimized'); onMinimize?.(config.id); },
    onLongPress: () => setContextMenu(true),
    enabled: state === 'widget',
  });

  const handleTap = useCallback(() => {
    if (state !== 'widget' || !blockRef.current) return;
    setOriginRect(blockRef.current.getBoundingClientRect());
    setState('fullscreen');
  }, [state]);

  const handleBack = useCallback(() => {
    setState('widget');
    setTimeout(() => setOriginRect(null), 350);
  }, []);

  // ===== FULLSCREEN =====
  if (state === 'fullscreen') {
    return (
      <>
        <div style={{ gridColumn: config.gridDesktop, minHeight: 140 }} />

        <motion.div
          layoutId={`block-${config.id}`}
          className="os-fullscreen"
          initial={originRect ? {
            position: 'fixed', left: originRect.x, top: originRect.y,
            width: originRect.width, height: originRect.height,
            borderRadius: 16,
          } : undefined}
          animate={{
            position: 'fixed', left: 0, top: 0, right: 0, bottom: 0,
            width: '100%', height: '100%', borderRadius: 0,
          }}
          transition={{ duration: 0.38, ease: [0.34, 1.2, 0.64, 1] }}
          style={{ zIndex: 100, overflow: 'hidden' }}
        >
          {/* Header */}
          <div className="flex items-center gap-3 px-5 py-4"
            style={{ borderBottom: '1px solid var(--os-border)' }}>
            <button onClick={handleBack}
              className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{ background: 'var(--os-bg-raised)', border: '1px solid var(--os-border)' }}>
              <ArrowLeft className="h-4 w-4" style={{ color: 'var(--os-text-sub)' }} />
            </button>
            <motion.div
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.12, duration: 0.25 }}
              className="flex items-center gap-3"
            >
              <config.icon className="h-5 w-5" style={{ color: config.accentColor }} />
              <span className="os-heading text-lg">{config.label}</span>
            </motion.div>
          </div>

          {/* Content */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15, duration: 0.3 }}
            style={{ padding: '20px 24px 120px', overflow: 'auto', flex: 1 }}
          >
            {fullscreenContent}
          </motion.div>
        </motion.div>
      </>
    );
  }

  if (state === 'minimized') return null;

  // ===== WIDGET =====
  // Determine if this is a "terminal" block (special dark bg)
  const isTerminal = config.variant === 'terminal';

  return (
    <motion.div
      ref={blockRef}
      layoutId={`block-${config.id}`}
      className="os-card"
      style={{
        gridColumn: config.gridDesktop,
        cursor: 'pointer',
        background: isTerminal ? '#050508' : undefined,
        borderColor: isTerminal ? 'rgba(20, 184, 166, 0.12)' : undefined,
        ...(isBlurred ? { filter: 'blur(12px)', opacity: 0.4 } : {}),
      }}
      onClick={handleTap}
      whileHover={{ y: -6, transition: { duration: 0.32, ease: [0.25, 0.46, 0.45, 0.94] } }}
    >
      {widgetContent}

      {/* Context menu (long press) */}
      <AnimatePresence>
        {contextMenu && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="absolute inset-0 z-50 flex items-center justify-center rounded-[inherit]"
            style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(8px)' }}
            onClick={e => { e.stopPropagation(); setContextMenu(false); }}
          >
            <div className="space-y-2 p-3">
              {[
                { icon: Minimize2, label: 'Minimize to basket', action: () => { setState('minimized'); onMinimize?.(config.id); setContextMenu(false); } },
                { icon: Pin, label: 'Pin to top', action: () => setContextMenu(false) },
                { icon: X, label: 'Remove from board', action: () => setContextMenu(false) },
              ].map(item => (
                <button key={item.label}
                  onClick={e => { e.stopPropagation(); item.action(); }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium"
                  style={{
                    background: 'var(--os-bg-card)',
                    color: 'var(--os-text)',
                    border: '1px solid var(--os-border)',
                  }}>
                  <item.icon className="h-4 w-4" style={{ color: 'var(--os-text-sub)' }} />
                  {item.label}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
