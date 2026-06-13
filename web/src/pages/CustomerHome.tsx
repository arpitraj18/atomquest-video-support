import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../lib/api';

export const CustomerHome: React.FC = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  const handleRequestHelp = async () => {
    setLoading(true);
    try {
      const data = await apiFetch<{ inviteCode: string }>('/api/sessions/queue', { method: 'POST' });
      navigate(`/join/${data.inviteCode}`);
    } catch (err) {
      alert('Could not join the queue. Please try again later.');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-on-surface mb-6">AtomQuest Support</h1>
        <p className="text-on-surface-variant text-lg mb-8 max-w-md mx-auto">
          Need help with your Atomberg devices? Connect instantly with one of our expert technicians over a video call.
        </p>
        <button
          onClick={handleRequestHelp}
          disabled={loading}
          className="bg-primary hover:bg-primary/90 text-on-primary font-bold py-4 px-8 rounded-full transition-colors flex items-center justify-center mx-auto text-lg"
        >
          {loading ? (
            <span className="spinner border-on-primary" style={{ width: '24px', height: '24px' }} />
          ) : (
            'Get Help Now'
          )}
        </button>
      </div>
    </div>
  );
};
