import { Router, type Request, type Response, type RequestHandler } from 'express'
import multer from 'multer'
import {
  createDocumentHandler,
  deleteDocumentHandler,
  exportDocumentsHandler,
  importDocumentsHandler,
  listDocumentsHandler,
  listArchivedDocumentsHandler,
  archiveDocumentHandler,
  restoreDocumentHandler
} from '../controllers/documentController.js'
import {
  createAttachmentHandler,
  deleteAttachmentHandler,
  downloadAttachmentHandler,
  listAttachmentsHandler
} from '../controllers/attachmentController.js'

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } })
const attachmentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
})

type AsyncController = (req: Request, res: Response) => Promise<unknown>

function asyncHandler(handler: AsyncController): RequestHandler {
  return (req, res, next) => {
    handler(req, res).catch(next)
  }
}

export const documentRouter = Router()

documentRouter.post('/', asyncHandler(createDocumentHandler))
documentRouter.get('/', asyncHandler(listDocumentsHandler))
documentRouter.get('/archived', asyncHandler(listArchivedDocumentsHandler))
documentRouter.get('/export', asyncHandler(exportDocumentsHandler))
documentRouter.post('/import', upload.single('file'), asyncHandler(importDocumentsHandler))
documentRouter.post('/:documentId/archive', asyncHandler(archiveDocumentHandler))
documentRouter.post('/:documentId/restore', asyncHandler(restoreDocumentHandler))
documentRouter.delete('/:documentId', asyncHandler(deleteDocumentHandler))
documentRouter.get('/:documentId/attachments', asyncHandler(listAttachmentsHandler))
documentRouter.post('/:documentId/attachments', attachmentUpload.single('file'), asyncHandler(createAttachmentHandler))
documentRouter.delete('/:documentId/attachments/:attachmentId', asyncHandler(deleteAttachmentHandler))
documentRouter.get('/:documentId/attachments/:attachmentId/content', asyncHandler(downloadAttachmentHandler))
