import 'reflect-metadata'
import * as dotenv from 'dotenv'
import { resolve } from 'path'

dotenv.config({ path: resolve(__dirname, '../../../.env') })

import { NestFactory } from '@nestjs/core'
import { ValidationPipe } from '@nestjs/common'
import cookieParser from 'cookie-parser'
import { AppModule } from './app.module'

async function bootstrap() {
  const app = await NestFactory.create(AppModule)

  app.use(cookieParser())
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }))
  // One shared API serves multiple frontends (notesync :3000, music :3010, …),
  // so CORS allows a LIST of origins. `CORS_ORIGINS` is comma-separated; it falls
  // back to the single `NEXTAUTH_URL` for the one-app/parallel-instance case.
  const corsOrigins = (process.env.CORS_ORIGINS ?? process.env.NEXTAUTH_URL ?? 'http://localhost:3000')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean)
  app.enableCors({
    origin: corsOrigins,
    credentials: true,
  })

  const port = process.env.API_PORT ?? 3001
  await app.listen(port)
  console.log(`API running on http://localhost:${port}/graphql`)
}

bootstrap()
