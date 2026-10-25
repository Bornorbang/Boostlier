"use client";
import { useEffect, useRef } from "react";
export function ConfirmDialog({
  title,
  children,
  onClose,
  headerActions,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  headerActions?: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="confirm-dialog"
      aria-labelledby="dialog-title"
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="panel">
        {headerActions ? (
          <div className="confirm-dialog-header">
            <h3 id="dialog-title">{title}</h3>
            <div className="confirm-dialog-header-actions">{headerActions}</div>
          </div>
        ) : (
          <h3 id="dialog-title">{title}</h3>
        )}
        {children}
      </div>
    </dialog>
  );
}
