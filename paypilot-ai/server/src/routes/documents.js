import { Router } from 'express';
import multer from 'multer';
import { createHash } from 'node:crypto';
import mongoose from 'mongoose';
import InvoiceDocument from '../models/InvoiceDocument.js';
import { audit } from '../Service/Audit.js';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 0 },
  fileFilter: (_req, file, callback) => {
    if (!['application/pdf', 'text/plain'].includes(file.mimetype)) {
      const error = new Error('Only PDF and plain-text invoice files are accepted.');
      error.status = 415;
      return callback(error);
    }
    callback(null, true);
  },
});

export function parseInvoiceFields(text) {
  const amount = text.match(/(?:total|amount\s+due|balance\s+due)[^\d]{0,30}([\d,]+(?:\.\d{1,2})?)/i);
  const invoice = text.match(/(?:invoice(?:\s*(?:number|no\.?))?|bill\s*(?:number|no\.?))\s*[:#-]?\s*([A-Z0-9][A-Z0-9/-]{1,49})/i);
  const due = text.match(/(?:due\s*date|payment\s*due)\s*[:#-]?\s*(\d{4}-\d{2}-\d{2}|\d{1,2}[/-]\d{1,2}[/-]\d{2,4})/i);
  const vendor = text.split(/\r?\n/).map((line) => line.trim()).find((line) => line.length >= 3 && line.length <= 200) ?? '';
  const parsedAmount = amount ? Number(amount[1].replaceAll(',', '')) : NaN;
  let dueDate;
  if (due) {
    const candidate = new Date(due[1]);
    if (!Number.isNaN(candidate.getTime())) dueDate = candidate;
  }
  return {
    vendor,
    invoiceNumber: invoice?.[1] ?? '',
    amountCents: Number.isFinite(parsedAmount) && parsedAmount >= 0 && Number.isSafeInteger(Math.round(parsedAmount * 100))
      ? Math.round(parsedAmount * 100) : undefined,
    dueDate,
  };
}

router.post('/invoices', (req, res, next) => {
  upload.single('file')(req, res, (error) => {
    if (error) {
      if (error instanceof multer.MulterError) {
        const status = error.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
        return res.status(status).json({ error: error.code === 'LIMIT_FILE_SIZE' ? 'Invoice file exceeds 5 MB.' : 'Upload exactly one invoice file.' });
      }
      return res.status(error.status ?? 400).json({ error: error.message });
    }
    next();
  });
}, async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'Select a PDF or plain-text invoice file.' });
    const file = req.file;
    const hash = createHash('sha256').update(file.buffer).digest('hex');
    if (file.mimetype === 'application/pdf' && file.buffer.subarray(0, 5).toString('ascii') !== '%PDF-') {
      return res.status(415).json({ error: 'File contents do not match a PDF.' });
    }
    if (file.mimetype === 'text/plain' && (file.buffer.includes(0) || file.buffer.toString('utf8').includes('\uFFFD'))) {
      return res.status(415).json({ error: 'File contents are not valid plain text.' });
    }
    if (await InvoiceDocument.exists({ organization: req.user.organizationId, sha256: hash })) {
      return res.status(409).json({ error: 'This invoice file was already uploaded to your organization.' });
    }

    let extractedText;
    if (file.mimetype === 'text/plain') {
      extractedText = file.buffer.toString('utf8');
    } else {
      const { PDFParse } = await import('pdf-parse');
      const parser = new PDFParse({ data: file.buffer });
      try {
        extractedText = (await parser.getText()).text;
      } finally {
        await parser.destroy();
      }
    }
    extractedText = String(extractedText ?? '').replace(/\u0000/g, '').slice(0, 30_000).trim();
    if (!extractedText) return res.status(422).json({ error: 'No readable text was found. Scanned-image PDFs need manual entry.' });

    const fields = parseInvoiceFields(extractedText);
    const invoice = await InvoiceDocument.create({
      organization: req.user.organizationId,
      uploadedBy: req.user.id,
      filename: file.originalname.replace(/[^\w.-]/g, '_').slice(0, 120) || 'invoice',
      mimeType: file.mimetype,
      sha256: hash,
      extractedText,
      ...fields,
    });
    await audit('invoice.uploaded', {
      userId: req.user.id,
      organizationId: req.user.organizationId,
      meta: { invoiceId: String(invoice._id), extractedAmount: Boolean(invoice.amountCents) },
    });
    res.status(201).json({ invoice, processing: 'local-only', fieldsNeedReview: true });
  } catch (error) { next(error); }
});

router.get('/invoices', async (req, res, next) => {
  try {
    const filter = { organization: req.user.organizationId };
    if (!['admin', 'manager', 'finance'].includes(req.user.role)) filter.uploadedBy = req.user.id;
    const invoices = await InvoiceDocument.find(filter)
      .select('-extractedText -sha256')
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();
    res.json({ invoices });
  } catch (error) { next(error); }
});

router.patch('/invoices/:id/status', async (req, res, next) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: 'Invoice not found.' });
    if (!['admin', 'finance'].includes(req.user.role)) return res.status(403).json({ error: 'Finance or admin permission required.' });
    if (!['matched', 'ignored', 'needs_review'].includes(req.body?.status)) {
      return res.status(400).json({ error: 'Status must be matched, ignored, or needs_review.' });
    }
    const invoice = await InvoiceDocument.findOneAndUpdate(
      { _id: req.params.id, organization: req.user.organizationId },
      { status: req.body.status },
      { new: true },
    ).select('-extractedText -sha256');
    if (!invoice) return res.status(404).json({ error: 'Invoice not found.' });
    await audit('invoice.reviewed', {
      userId: req.user.id, organizationId: req.user.organizationId,
      meta: { invoiceId: String(invoice._id), status: invoice.status },
    });
    res.json({ invoice });
  } catch (error) { next(error); }
});

export default router;
