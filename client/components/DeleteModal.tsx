// components/DeleteModal.tsx
"use client";

import { Loader2, AlertTriangle, X } from "lucide-react";

type DeleteModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  loading?: boolean;
};

export function DeleteModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  loading = false,
}: DeleteModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div 
        className="relative w-full max-w-md rounded-xl border border-[#2B2723] bg-[#181614] p-6 shadow-2xl shadow-black/80"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          disabled={loading}
          className="absolute right-4 top-4 rounded-md p-1.5 text-[#A39B90] hover:bg-[#211E1B] hover:text-[#ECE7DF] transition-colors"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex items-center gap-3.5 mb-4">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-[#E5776A]/15 border border-[#E5776A]/30 text-[#E5776A]">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-[#ECE7DF]">{title}</h3>
            <p className="text-xs text-[#A39B90]">This action cannot be undone.</p>
          </div>
        </div>

        <p className="text-sm text-[#A39B90] leading-relaxed mb-6">
          {description}
        </p>

        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            disabled={loading}
            onClick={onClose}
            className="rounded-lg border border-[#2B2723] px-4 py-2 text-sm font-medium text-[#ECE7DF] hover:bg-[#211E1B] transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={onConfirm}
            className="inline-flex items-center gap-2 rounded-lg bg-[#E5776A] px-4 py-2 text-sm font-medium text-white hover:bg-[#d4675b] transition-colors disabled:opacity-50"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            <span>{loading ? "Deleting..." : "Confirm Delete"}</span>
          </button>
        </div>
      </div>
    </div>
  );
}