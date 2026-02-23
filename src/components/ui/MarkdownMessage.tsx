'use client'

import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { cn } from '@/lib/utils'

interface MarkdownMessageProps {
  content?: string | null
  className?: string
}

export function MarkdownMessage({ content, className }: MarkdownMessageProps) {
  if (!content?.trim()) return null

  return (
    <div
      className={cn(
        'prose prose-sm max-w-none text-[#1F2937] leading-relaxed',
        '[&_p]:my-1.5 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0',
        '[&_strong]:font-semibold [&_strong]:text-[#1F2937]',
        '[&_em]:italic [&_em]:text-[#4B5563]',
        '[&_ul]:my-1.5 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-1 [&_ul]:marker:text-[#8B5CF6]',
        '[&_ol]:my-1.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:space-y-1 [&_ol]:marker:text-[#8B5CF6]',
        '[&_li]:pl-1',
        '[&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-[#1F2937] [&_pre]:px-3 [&_pre]:py-2.5',
        '[&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:text-white',
        '[&_hr]:my-2 [&_hr]:border-[#E5E7EB]',
        className
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children, ...props }) => (
            <a
              {...props}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-[#8B5CF6] underline underline-offset-2 decoration-[#8B5CF6]/50 hover:text-[#7C3AED]"
            >
              {children}
            </a>
          ),
          code: ({ className: codeClassName, children, ...props }) => {
            const text = String(children ?? '')
            const isBlock = Boolean(codeClassName) || text.includes('\n')

            if (isBlock) {
              return (
                <code
                  {...props}
                  className={cn(
                    'block min-w-full font-mono text-[13px] leading-6 text-white',
                    codeClassName
                  )}
                >
                  {children}
                </code>
              )
            }

            return (
              <code
                {...props}
                className="rounded bg-[#EDE9FE] px-1.5 py-0.5 font-mono text-[13px] text-[#7C3AED]"
              >
                {children}
              </code>
            )
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  )
}
