import React, { useState } from 'react';
import { apiFetch } from '../lib/api';

interface PostCallSurveyProps {
  sessionId: string;
  role: 'agent' | 'customer';
  onComplete: () => void;
}

export const PostCallSurvey: React.FC<PostCallSurveyProps> = ({ sessionId, role, onComplete }) => {
  const [loading, setLoading] = useState(false);
  const [score, setScore] = useState<number>(0);
  const [comment, setComment] = useState('');
  const [disposition, setDisposition] = useState('Resolved');
  const [notes, setNotes] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (role === 'customer') {
        if (score === 0) {
          alert('Please select a rating.');
          setLoading(false);
          return;
        }
        await apiFetch(`/api/sessions/${sessionId}/csat`, {
          method: 'POST',
          body: JSON.stringify({ score, comment: comment || null }),
        });
      } else {
        await apiFetch(`/api/sessions/${sessionId}/disposition`, {
          method: 'POST',
          body: JSON.stringify({ disposition, notes: notes || null }),
        });
      }
      onComplete();
    } catch (err) {
      alert('Failed to submit. Please try again.');
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-background/90 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-surface rounded-2xl shadow-2xl border border-outline-variant/30 w-full max-w-lg p-8 animate-fade-in">
        <h2 className="text-2xl font-bold text-on-surface mb-2">
          {role === 'customer' ? 'How did we do?' : 'Session Summary'}
        </h2>
        <p className="text-on-surface-variant mb-6">
          {role === 'customer' 
            ? 'Please rate your support experience to help us improve.' 
            : 'Log the outcome of this session.'}
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-6">
          {role === 'customer' ? (
            <>
              <div>
                <label className="block text-sm font-bold text-on-surface-variant mb-2">Rating</label>
                <div className="flex gap-2">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setScore(star)}
                      className={`text-4xl transition-colors ${score >= star ? 'text-warning' : 'text-surface-variant'}`}
                    >
                      <span className={score >= star ? 'material-symbols-outlined filled-icon' : 'material-symbols-outlined'}>star</span>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-bold text-on-surface-variant mb-2">Additional Comments (Optional)</label>
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Tell us what went well or what could be improved..."
                  className="w-full bg-surface-container-high border border-outline-variant rounded-xl px-4 py-3 text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary min-h-[100px]"
                />
              </div>
            </>
          ) : (
            <>
              <div>
                <label className="block text-sm font-bold text-on-surface-variant mb-2">Outcome (Disposition)</label>
                <select
                  value={disposition}
                  onChange={(e) => setDisposition(e.target.value)}
                  className="w-full bg-surface-container-high border border-outline-variant rounded-xl px-4 py-3 text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary"
                >
                  <option value="Resolved">Resolved</option>
                  <option value="Needs follow-up">Needs follow-up</option>
                  <option value="RMA initiated">RMA initiated</option>
                  <option value="Customer dropped">Customer dropped</option>
                  <option value="Escalated">Escalated</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-bold text-on-surface-variant mb-2">Agent Notes</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Add any internal notes for this case..."
                  className="w-full bg-surface-container-high border border-outline-variant rounded-xl px-4 py-3 text-on-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary min-h-[100px]"
                />
              </div>
            </>
          )}

          <div className="flex gap-4 mt-2">
             <button
                type="button"
                onClick={onComplete}
                className="flex-1 py-3 px-4 rounded-xl font-bold text-on-surface-variant hover:bg-surface-variant transition-colors"
                disabled={loading}
             >
                Skip
             </button>
             <button
                type="submit"
                disabled={loading || (role === 'customer' && score === 0)}
                className="flex-[2] bg-primary hover:bg-primary/90 disabled:opacity-50 text-on-primary font-bold py-3 px-4 rounded-xl transition-colors flex justify-center items-center"
             >
                {loading ? <span className="spinner border-on-primary" style={{ width: '20px', height: '20px', borderWidth: '2px' }} /> : 'Submit'}
             </button>
          </div>
        </form>
      </div>
    </div>
  );
};
