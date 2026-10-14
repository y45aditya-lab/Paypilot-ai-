import { useState } from 'react';
import { requestRecommendation } from '../services/api.js';
import RecommendationForm from './RecommendationForm.jsx';
import RecommendationResult from './RecommendationResult.jsx';

export default function PurchaseAssistant() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  async function handleSubmit(input) {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      setResult(await requestRecommendation(input));
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <RecommendationForm onSubmit={handleSubmit} loading={loading} />
      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {result && <RecommendationResult result={result} />}
    </div>
  );
}