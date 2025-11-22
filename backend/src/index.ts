import { createApp } from './app.js'
import { env } from './config/env.js'
import { logger } from './config/logger.js'
import { initializeServices } from './services/documentService.js'

async function bootstrap() {
  try {
    await initializeServices()
    const app = createApp()
    app.listen(env.PORT, () => {
      logger.info({ port: env.PORT }, 'Backend ready')
    })
  } catch (error) {
    logger.error({ err: error }, 'Failed to bootstrap server')
    process.exit(1)
  }
}

void bootstrap()
