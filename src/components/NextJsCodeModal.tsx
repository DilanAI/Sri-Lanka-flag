import { Check, Copy, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { NEXTJS_COMPONENT_CODE, NEXTJS_PAGE_CODE } from '../data/nextjsSnippet';

interface NextJsCodeModalProps {
  open: boolean;
  onClose: () => void;
}

type FileTab = 'component' | 'page';

export default function NextJsCodeModal({ open, onClose }: NextJsCodeModalProps) {
  const [activeTab, setActiveTab] = useState<FileTab>('component');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const codeToShow = activeTab === 'component' ? NEXTJS_COMPONENT_CODE : NEXTJS_PAGE_CODE;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(codeToShow);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="nextjs-modal-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-4xl max-h-[88vh] flex flex-col rounded-2xl bg-[#0D1420] border border-white/14 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-4 px-6 py-4 border-b border-white/10">
          <div>
            <h2 id="nextjs-modal-title" className="font-display text-lg font-medium text-white">
              Next.js App Router Program
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Install Three.js <span aria-hidden="true">·</span>{' '}
              <code className="font-mono-code text-[#FFBE29]">npm install three @types/three</code>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Next.js code modal"
            className="h-10 w-10 flex items-center justify-center rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors focus-visible:outline-2 focus-visible:outline-[#FFBE29]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* File Tabs + Copy */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-3 bg-[#090E17] border-b border-white/10">
          <div className="flex items-center gap-1 p-1 rounded-lg bg-white/5 border border-white/10">
            <button
              type="button"
              onClick={() => setActiveTab('component')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'component'
                  ? 'bg-[#FFBE29] text-slate-950'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              components/SriLankaFlag3D.tsx
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('page')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'page'
                  ? 'bg-[#FFBE29] text-slate-950'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              app/page.tsx
            </button>
          </div>

          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium rounded-lg bg-white/10 hover:bg-white/15 text-white border border-white/12 transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-[#FFBE29]"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span>Copied</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                <span>Copy File</span>
              </>
            )}
          </button>
        </div>

        {/* Code Body */}
        <div className="flex-1 overflow-auto p-6 bg-[#070B12]">
          <pre className="font-mono-code text-xs leading-relaxed text-slate-200 whitespace-pre">
            <code>{codeToShow}</code>
          </pre>
        </div>
      </div>
    </div>
  );
}
