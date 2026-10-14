import { Router } from 'express';
import { runRecommendationAgent } from '../Service/recommendationAgent.js';
import { buildQuote } from '../Service/validateRecommendation.js';

const router = Router();

router.post('/', async (req, res, next) => {
  try {
    const { message, budgetUsd } = req.body ?? {};

    // Validate input at the door
    if (typeof message !== 'string' || message.trim().length < 5 || message.length > 500) {
      return res.status(400).json({ error: 'message must be 5-500 characters' });
    }
    if (typeof budgetUsd !== 'number' || !(budgetUsd > 0) || budgetUsd > 100000) {
      return res.status(400).json({ error: 'budgetUsd must be a positive number' });
    }
    const budgetCents = Math.round(budgetUsd * 100);

    // 1) AI proposes
    const suggestion = await runRecommendationAgent({ message: message.trim(), budgetCents });

    if (suggestion.productId == null) {
      return res.json({ ok: false, reason: suggestion.reasoning });
    }

    // 2) Server verifies and prices
    const result = await buildQuote({ ...suggestion, budgetCents });
    if (!result.ok) {
      return res.status(422).json({ ok: false, reason: result.errors.join(' ') });
    }

    // 3) Return server-computed numbers + the AI's explanation
    res.json({ ok: true, quote: result.quote, reasoning: suggestion.reasoning });
  } catch (err) {
    next(err); // handled by your error middleware
  }
});

export default router;