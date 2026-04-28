// src/lib/puppeteerBrowser.ts
// Resolves the correct Chromium executable for both local dev and Vercel serverless.
import fs from "fs";
import puppeteer from "puppeteer-core";
import type { Browser } from "puppeteer-core";

async function resolveExecutablePath(): Promise<string> {
  const fromEnv = process.env.PUPPETEER_EXECUTABLE_PATH?.trim();
  if (fromEnv) return fromEnv;

  // On Vercel (production), use @sparticuz/chromium serverless binary
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    const chromium = await import("@sparticuz/chromium");
    return chromium.default.executablePath();
  }

  // Local development — find Chrome or Edge
  const candidates = [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium-browser",
    "/usr/bin/chromium",
  ];

  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return p;
    } catch {
      // continue
    }
  }

  // Fall back to sparticuz in dev too
  const chromium = await import("@sparticuz/chromium");
  return chromium.default.executablePath();
}

export async function launchBrowser(): Promise<Browser> {
  const executablePath = await resolveExecutablePath();

  let extraArgs: string[] = [];
  if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
    const chromium = await import("@sparticuz/chromium");
    extraArgs = chromium.default.args;
  }

  return puppeteer.launch({
    executablePath,
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      ...extraArgs,
    ],
  });
}

export function parseCookiesForPuppeteer(
  cookieHeader: string,
  domain: string
): { name: string; value: string; domain: string }[] {
  return cookieHeader
    .split(";")
    .map((c) => c.trim())
    .filter(Boolean)
    .flatMap((c) => {
      const eqIdx = c.indexOf("=");
      if (eqIdx < 0) return [];
      const name = c.slice(0, eqIdx).trim();
      const value = c.slice(eqIdx + 1).trim();
      if (!name) return [];
      return [{ name, value, domain }];
    });
}
