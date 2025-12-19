'use client'
import { useCallback } from 'react'

export default function PrintButton({ className = '' }: { className?: string }) {
  const onClick = useCallback(() => window.print(), [])
  return (
    <button
      onClick={onClick}
      className={className || 'rounded-lg border px-3 py-1.5 text-sm hover:bg-gray-50'}
      title="Print / Save as PDF"
    >
      Print / Save as PDF
    </button>
  )
}
