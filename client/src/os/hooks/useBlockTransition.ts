import { useState, useCallback, useRef } from 'react';

type BlockState = 'widget' | 'fullscreen' | 'minimized';

interface TransitionConfig {
  onMinimize?: (blockId: string) => void;
  onExpand?: (blockId: string) => void;
  onCollapse?: (blockId: string) => void;
}

export function useBlockTransition(blockId: string, config: TransitionConfig = {}) {
  const [state, setState] = useState<BlockState>('widget');
  const [originRect, setOriginRect] = useState<DOMRect | null>(null);
  const blockRef = useRef<HTMLDivElement>(null);

  const expand = useCallback(() => {
    if (state !== 'widget' || !blockRef.current) return;
    setOriginRect(blockRef.current.getBoundingClientRect());
    setState('fullscreen');
    config.onExpand?.(blockId);
  }, [state, blockId, config]);

  const collapse = useCallback(() => {
    setState('widget');
    setTimeout(() => setOriginRect(null), 380);
    config.onCollapse?.(blockId);
  }, [blockId, config]);

  const minimize = useCallback(() => {
    setState('minimized');
    config.onMinimize?.(blockId);
  }, [blockId, config]);

  const restore = useCallback(() => {
    setState('widget');
  }, []);

  return {
    state,
    originRect,
    blockRef,
    expand,
    collapse,
    minimize,
    restore,
    isWidget: state === 'widget',
    isFullscreen: state === 'fullscreen',
    isMinimized: state === 'minimized',
  };
}
