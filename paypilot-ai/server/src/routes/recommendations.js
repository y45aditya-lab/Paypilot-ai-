import { Router } from 'express';
import { runRecommendationAgent } from '../Service/recommendationAgent.js';
import { buildQuote } from '../Service/validateRecommendation.js';

const router = Router();
const CATEGORIES = ['project-management', 'crm', 'design', 'communication', 'accounting'];

router.post('/', async (req, res, next) => {
  try {
    const { message, budgetInr, seats, category } = req.body ?? {};

    // Validate input at the door
    if (typeof message !== 'string' || message.trim().length < 5 || message.length > 500) {
      return res.status(400).json({ error: 'message must be 5-500 characters' });
    }
    if (typeof budgetInr !== 'number' || !(budgetInr > 0) || budgetInr > 100000) {
      return res.status(400).json({ error: 'budgetInr must be a positive number' });
    }
    if (seats !== undefined && (!Number.isInteger(seats) || seats < 1 || seats > 1000)) {
      return res.status(400).json({ error: 'seats must be a whole number between 1 and 1000' });
    }
    if (category !== undefined && !CATEGORIES.includes(category)) {
      return res.status(400).json({ error: 'category is not supported' });
    }
    const budgetCents = Math.round(budgetInr * 100);

    // 1) AI proposes
    const suggestion = await runRecommendationAgent({
      message: message.trim(),
      budgetCents,
      requiredSeats: seats,
      requiredCategory: category,
    });

    if (suggestion.productId == null) {
      return res.json({ ok: false, reason: suggestion.reasoning });
    }

    // 2) Server verifies and prices
    const result = await buildQuote({ ...suggestion, seats: seats ?? suggestion.seats, budgetCents });
    if (!result.ok) {
      return res.status(422).json({ ok: false, reason: result.errors.join(' ') });
    }
    if (category && result.quote.product.category !== category) {
      return res.status(422).json({ ok: false, reason: 'The recommendation did not match the requested category.' });
    }

    // 3) Return server-computed numbers + the AI's explanation
    res.json({ ok: true, quote: result.quote, reasoning: suggestion.reasoning, mode: suggestion.mode });
  } catch (err) {
    next(err); // handled by your error middleware
  }
});

export default router;