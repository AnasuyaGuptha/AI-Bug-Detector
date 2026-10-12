import { Highlight, type PrismTheme } from 'prism-react-renderer'
import type { CSSProperties, ReactNode } from 'react'
import { severityVar } from '../severity'
import type { Severity } from '../types'

// Muted pastel syntax theme that matches the app palette.
const theme: PrismTheme = {
  plain: { color: '#cecdda', backgroundColor: 'transparent' },
  styles: [
    { types: ['comment', 'prolog', 'doctype', 'cdata'], style: { color: '#6f6e7e', fontStyle: 'italic' } },
    { types: ['keyword', 'builtin', 'important', 'atrule'], style: { color: '#b8a6f7' } },
    { types: ['string', 'char', 'attr-value', 'template-string', 'regex'], style: { color: '#a7d9c1' } },
    { types: ['number', 'boolean', 'constant', 'symbol'], style: { color: '#f4c19f' } },
    { types: ['function', 'method'], style: { color: '#a9c4ec' } },
    { types: ['class-name', 'maybe-class-name', 'tag'], style: { color: '#eedd9f' } },
    { types: ['punctuation', 'operator'], style: { color: '#8f8ea0' } },
    { types: ['property', 'attr-name', 'variable', 'parameter'], style: { color: '#e3c8f0' } },
    { types: ['decorator', 'annotation'], style: { color: '#f2a7b8' } },
  ],
}

export type LineMark = 'hit' | 'add' | 'del' | undefined

interface Props {
  code: string
  language: string
  header: ReactNode
  /** Line number for each line. Defaults to startLine + index. Use null to hide. */
  numbers?: (number | null)[]
  startLine?: number
  /** Optional mark for each line. */
  marks?: LineMark[]
  /** Colour for "hit" lines. */
  severity?: Severity
  /** Show a +/− column for add/del lines. */
  showSigns?: boolean
}

function lineStyle(mark: LineMark, severity: Severity): CSSProperties | undefined {
  if (!mark) return undefined
  const color = mark === 'hit' ? severityVar(severity) : mark === 'add' ? 'var(--color-add)' : 'var(--color-del)'
  return {
    backgroundColor: `color-mix(in srgb, ${color} 9%, transparent)`,
    boxShadow: `inset 2px 0 0 ${color}`,
  }
}

const SIGN: Record<string, string> = { add: '+', del: '−' }

export default function CodeBlock({
  code,
  language,
  header,
  numbers,
  startLine = 1,
  marks = [],
  severity = 'medium',
  showSigns = true,
}: Props) {
  const hasSigns = showSigns && marks.some((m) => m === 'add' || m === 'del')

  return (
    <div className="overflow-hidden rounded-xl border border-line bg-[#141418]">
      <div className="flex min-h-10 items-center justify-between gap-3 border-b border-line bg-surface px-3 py-1.5 text-xs text-muted">
        {header}
      </div>
      <Highlight code={code} language={language} theme={theme}>
        {({ tokens, getLineProps, getTokenProps }) => (
          <pre className="overflow-x-auto py-3 font-mono text-[13px] leading-[1.7]">
            <code className="block min-w-max">
              {tokens.map((line, i) => {
                const mark = marks[i]
                const n = numbers ? numbers[i] : startLine + i
                const { className, style, ...rest } = getLineProps({ line })
                return (
                  <div
                    key={i}
                    {...rest}
                    className={`${className} flex pr-6`}
                    style={{ ...style, ...lineStyle(mark, severity) }}
                  >
                    <span className="w-12 shrink-0 select-none pr-4 text-right text-faint/80 tabular-nums">
                      {n ?? ''}
                    </span>
                    {hasSigns && (
                      <span
                        className={`w-5 shrink-0 select-none ${mark === 'add' ? 'text-add' : mark === 'del' ? 'text-del' : ''}`}
                        aria-hidden
                      >
                        {mark ? SIGN[mark] ?? '' : ''}
                      </span>
                    )}
                    <span className={mark === 'del' ? 'opacity-70' : undefined}>
                      {line.map((token, key) => (
                        <span key={key} {...getTokenProps({ token })} />
                      ))}
                      {line.length === 1 && line[0].empty ? ' ' : null}
                    </span>
                  </div>
                )
              })}
            </code>
          </pre>
        )}
      </Highlight>
    </div>
  )
}
