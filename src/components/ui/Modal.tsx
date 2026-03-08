"use client";

import { ReactNode, useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  size?: "sm" | "md" | "lg";
  tone?: "default" | "subtle";
  placement?: "center" | "right";
}

const sizes = {
  sm: "max-w-md",
  md: "max-w-lg",
  lg: "max-w-2xl",
};

export function Modal({
  isOpen,
  onClose,
  title,
  children,
  size = "md",
  tone = "default",
  placement = "center",
}: ModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (!isOpen) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return createPortal(
    <div
      ref={overlayRef}
      className={`fixed inset-0 z-50 flex bg-slate-950/45 px-4 backdrop-blur-sm ${
        placement === "right" ? "items-stretch justify-end py-0" : "items-center justify-center"
      }`}
      onClick={(e) => {
        if (e.target === overlayRef.current) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`w-full ${sizes[size]} overflow-hidden border border-[var(--border)] ${
          tone === "subtle" ? "bg-[var(--surface-2)]" : "bg-[var(--surface)]"
        } shadow-[var(--shadow-md)] animate-enter ${
          placement === "right"
            ? "my-0 h-full max-w-xl rounded-none border-y-0 border-r-0"
            : "rounded-xl"
        }`}
      >
        <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
          <h3 id={titleId} className="text-base font-semibold text-[var(--text)]">{title}</h3>
          <button
            onClick={onClose}
            className="focus-ring rounded-md p-1 text-[var(--muted)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--text)]"
            aria-label="Close modal"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className={`px-4 py-4 ${placement === "right" ? "h-[calc(100%-57px)] overflow-y-auto" : ""}`}>
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}
