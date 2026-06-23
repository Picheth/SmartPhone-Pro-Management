import React, { useState, useRef } from 'react';
import { createPortal } from 'react-dom';

interface TooltipProps {
  content: string;
  children: React.ReactNode;
  position?: 'top' | 'bottom' | 'left' | 'right';
  className?: string;
}

const Tooltip: React.FC<TooltipProps> = ({
  content,
  children,
  position = 'top',
  className = '',
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLDivElement>(null);

  const handleMouseEnter = () => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();

      let top = 0;
      let left = 0;

      switch (position) {
        case 'top':
          top = rect.top - 6;
          left = rect.left + rect.width / 2;
          break;

        case 'bottom':
          top = rect.bottom + 6;
          left = rect.left + rect.width / 2;
          break;

        case 'left':
          top = rect.top + rect.height / 2;
          left = rect.left - 6;
          break;

        case 'right':
          top = rect.top + rect.height / 2;
          left = rect.right + 6;
          break;
      }

      setCoords({ top, left });
    }

    setIsVisible(true);
  };

  return (
    <div
      ref={triggerRef}
      className={`relative inline-block ${className}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={() => setIsVisible(false)}
    >
      {children}

      {isVisible &&
        createPortal(
          <div
            className={`fixed z-[9999] px-2 py-1 text-xs font-medium text-white bg-gray-900 dark:bg-gray-700 rounded shadow-lg pointer-events-none transform transition-opacity duration-200 border border-gray-700 dark:border-gray-600
              ${position === 'top' ? '-translate-y-full -translate-x-1/2' : ''}
              ${position === 'bottom' ? '-translate-x-1/2' : ''}
              ${position === 'left' ? '-translate-x-full -translate-y-1/2' : ''}
              ${position === 'right' ? '-translate-y-1/2' : ''}
            `}
            style={{
              top: coords.top,
              left: coords.left,
            }}
          >
            {content}
          </div>,
          document.body
        )}
    </div>
  );
};

export { Tooltip };
export default Tooltip;