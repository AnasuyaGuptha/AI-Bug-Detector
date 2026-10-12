import { Check, Copy } from 'lucide-react'
import { useEffect, useState } from 'react'

export default function CopyButton({ text, label = 'Copy' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return
    const t = window.setTimeout(() => setCopied(false), 1600)
    return () => window.clearTimeout(t)
  }, [copied])

  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
    } catch {
      // Clipboard blocked (e.g. insecure context). Nothing useful to show.
    }
  }

  return (
    <button type="button" onClick={copy} className="btn-ghost text-xs" aria-live="polite">
      {copied ? <Check className="size-3.5 text-sev-low" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
      {copied ? 'Copied' : label}
    </button>
  )
}
