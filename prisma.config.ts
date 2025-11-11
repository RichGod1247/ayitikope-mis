// prisma.config.ts
import { defineConfig } from '@prisma/config'
import path from 'path'
import dotenv from 'dotenv'

// Force-load environment from prisma/.env (not project root .env)
dotenv.config({ path: path.resolve(process.cwd(), 'prisma/.env') })

export default defineConfig({
  schema: './prisma/schema.prisma',
})
