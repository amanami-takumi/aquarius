import type { NextFunction, Request, Response } from 'express'
import { MulterError } from 'multer'
import { logger } from '../config/logger.js'
import { AppError } from '../utils/error.js'

export function errorHandler(error: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (error instanceof AppError) {
    if (error.statusCode >= 500) {
      logger.error({ err: error }, error.message)
    }
    return res.status(error.statusCode).json({ message: error.message, details: error.details })
  }

  if (error instanceof MulterError) {
    return res.status(400).json({ message: error.message })
  }

  logger.error({ err: error }, 'Unexpected error')
  return res.status(500).json({ message: '内部サーバーエラーが発生しました' })
}
