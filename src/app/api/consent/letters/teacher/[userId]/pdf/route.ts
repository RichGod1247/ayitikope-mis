// src/app/api/consent/letters/teacher/[userId]/pdf/route.ts
import type { NextRequest } from 'next/server'
import puppeteer from 'puppeteer-core'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function resolveExecutablePath(): string {
  const fromEnv = process.env.PUPPETEER_EXECUTABLE_PATH?.trim()
  if (fromEnv) return fromEnv
  const candidates = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  ]
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const fs = require('fs') as typeof import('fs')
  for (const p of candidates) {
    if (fs.existsSync(p)) return p
  }
  throw new Error('Chrome/Edge not found. Set PUPPETEER_EXECUTABLE_PATH in .env.local')
}

function originFromEnv() {
  const o = process.env.NEXT_PUBLIC_BASE_URL?.replace(/\/$/, '')
  return o || `http://localhost:${process.env.PORT || 3000}`
}

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ userId: string }> }
) {
  const { userId } = await ctx.params

  const origin = originFromEnv()
  const letterUrl = `${origin}/headteacher/consent/letters/teacher/${encodeURIComponent(userId)}`

  let browser: Awaited<ReturnType<typeof puppeteer.launch>> | null = null
  try {
    const executablePath = resolveExecutablePath()
    browser = await puppeteer.launch({
      executablePath,
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    })

    const page = await browser.newPage()
    await page.setViewport({ width: 794, height: 1123, deviceScaleFactor: 1 })
    await page.goto(letterUrl, { waitUntil: 'networkidle0', timeout: 60_000 })

    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: '12mm', right: '12mm', bottom: '12mm', left: '12mm' },
    })

    const buf = Buffer.from(pdf)
    const headers = new Headers()
    headers.set('content-type', 'application/pdf')
    headers.set('content-disposition', `attachment; filename="teacher-consent-${userId}.pdf"`)

    return new Response(buf, { status: 200, headers })
  } catch (err) {
    console.error('Teacher letter PDF error:', err)
    return new Response(JSON.stringify({ error: 'Failed to render PDF' }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    })
  } finally {
    if (browser) await browser.close().catch(() => {})
  }
}
