// Wraps a zod schema: bad input is rejected with 400 before it reaches your logic.
export const validate = (schema) => (req, res, next) => {
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.issues.map((i) => i.message).join('; ') });
  }
  req.body = parsed.data; // cleaned values (trimmed, lowercased...) replace the raw body
  next();
};