import express from 'express'
import cors from 'cors'
import { pinoHttp } from 'pino-http'
import { documentRouter } from './routes/documents.js'
import { errorHandler } from './middlewares/errorHandler.js'
import { logger } from './config/logger.js'

export function createApp() {
  const app = express()

  app.use(cors())
  app.use(express.json({ limit: '2mb' }))
  app.use(pinoHttp({ logger }))

  app.get('/healthz', (_req, res) => {
    res.json({ status: 'ok' })
  })

  app.use('/documents', documentRouter)

  app.use(errorHandler)

  return app
}
