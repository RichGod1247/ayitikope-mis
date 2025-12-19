// src/app/api/consent/letters/student/[studentId]/pdf/route.ts
import type { NextRequest } from 'next/server'
import puppeteer from 'puppeteer-core'
import fs from 'fs'
import path from 'path'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs' // puppeteer needs Node runtime

function resolveExecutablePath(): string {
  // Allow override via env
  const fromEnv = process.env.PUPPETEER_EXECUTABLE_PATH?.trim()
  if (fromEnv) return fromEnv

  // Common Windows install locations for Chrome/Edge
  const candidates = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
  ]

  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return p
    } catch {
      // ignore and continue
    }
  }

  throw new Error(
    'Chrome/Edge executable not found. Install Chrome/Edge or set PUPPETEER_EXECUTABLE_PATH in .env.local'
  )
}

export async function GET(
  _req: NextRequest,
  ctx: { params: { studentId: string } } // In route handlers, params is a plain object (unlike Page components)
) {
  const { studentId } = ctx.params

  const origin =
    process.env.NEXT_PUBLIC_BASE_URL?.replace(/\/$/, '') ||
    `http://localhost:${process.env.PORT || 3000}`

  const letterUrl = `${origin}/headteacher/consent/letters/student/${encodeURIComponent(studentId)}`

  let browser: Awaited<ReturnType<typeof puppeteer.launch>> | null = null

  try {
    const executablePath = resolveExecutablePath()

    browser = await puppeteer.launch({
      executablePath,
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    })

    const page = await browser.newPage()
    // A4 portrait ~ 794x1123 CSS px @ 96 DPI (we’ll still use format: 'A4')
    await page.setViewport({ width: 794, height: 1123, deviceScaleFactor: 1 })

    // Navigate to the letter page and wait for network to be idle
    await page.goto(letterUrl, { waitUntil: 'networkidle0', timeout: 60_000 })

    const pdfBytes = await page.pdf({
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: '12mm', right: '12mm', bottom: '12mm', left: '12mm' },
    })

    // Ensure Node's Buffer for Response body typing
    const buf = Buffer.from(pdfBytes)

    const headers = new Headers()
    headers.set('content-type', 'application/pdf')
    headers.set('content-disposition', `attachment; filename="student-consent-${studentId}.pdf"`)

    return new Response(buf, { status: 200, headers })
  } catch (err: any) {
    console.error('Student letter PDF error:', err)
    return new Response(JSON.stringify({ error: 'Failed to render PDF' }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    })
  } finally {
    if (browser) {
      try {
        await browser.close()
      } catch {
        /* ignore */
      }
    }
  }
}
