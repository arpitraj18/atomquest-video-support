import React, { useEffect, useRef, useState } from 'react';
import { Send, Paperclip } from 'lucide-react';
import { formatTime, formatBytes } from '../lib/format';
import { fileDownloadUrl } from '../lib/api';

export interface ChatMsg {
  id: string;
  senderRole: 'agent' | 'customer';
  senderName: string;
  body: string;
  fileId: string | null;
  createdAt: string;
  file?: { id: string; name: string; mimeType: string; sizeBytes: number };
}

interface ChatPanelProps {
  messages: ChatMsg[];
  sessionId: string;
  onSend: (body: string) => void;
  onFileUpload: (file: File) => void;
  disabled?: boolean;
}

export const ChatPanel: React.FC<ChatPanelProps> = ({ messages, sessionId, onSend, onFileUpload, disabled }) => {
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const body = input.trim();
    if (!body) return;
    onSend(body);
    setInput('');
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onFileUpload(file);
      e.target.value = '';
    }
  };

  return (
    <div className="flex flex-col h-full bg-surface-container-lowest border-l border-surface-variant">
      <div className="flex items-center justify-between p-4 border-b border-surface-variant">
        <span className="font-label-sm text-outline uppercase tracking-wider">Chat</span>
        <span className="font-mono text-xs text-on-surface-variant">{messages.length}</span>
      </div>

      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4">
        {messages.length === 0 && (
          <div className="text-center py-8 text-on-surface-variant text-sm opacity-80">
            No messages yet. Say hello!
          </div>
        )}
        {messages.map((msg) => (
          <div key={msg.id} className="animate-in fade-in slide-in-from-bottom-2 duration-300">
            <div className="flex items-center gap-2 mb-1">
              <span className={`font-label-sm font-bold ${msg.senderRole === 'agent' ? 'text-primary' : 'text-success'}`}>{msg.senderName}</span>
              <span className="font-mono text-[10px] text-on-surface-variant">{formatTime(msg.createdAt)}</span>
            </div>
            <div className={`font-body-md text-on-surface leading-relaxed p-3 rounded-lg border bg-surface ${msg.senderRole === 'agent' ? 'border-l-2 border-l-primary border-surface-variant/50' : 'border-l-2 border-l-success border-surface-variant/50'} break-words`}>
              {msg.body}
              {msg.file && (
                <a
                  href={fileDownloadUrl(sessionId, msg.file.id)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 mt-2 p-2 bg-surface-variant/30 hover:bg-surface-variant/50 rounded-md text-xs text-primary transition-colors no-underline"
                >
                  <Paperclip size={14} />
                  <span>{msg.file.name}</span>
                  <span className="text-[10px] text-on-surface-variant">{formatBytes(msg.file.sizeBytes)}</span>
                </a>
              )}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      <form className="flex items-center gap-2 p-3 border-t border-surface-variant bg-surface" onSubmit={handleSubmit}>
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFile}
          style={{ display: 'none' }}
          accept="image/*,.pdf,.txt,.csv,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
        />
        <button
          type="button"
          className="flex items-center justify-center w-10 h-10 rounded-full text-on-surface-variant hover:text-on-surface hover:bg-surface-variant/50 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          onClick={() => fileInputRef.current?.click()}
          disabled={disabled}
          title="Share a file"
        >
          <Paperclip size={18} />
        </button>
        <input
          type="text"
          className="flex-1 bg-transparent border-none p-2 font-body-md text-on-surface focus:outline-none placeholder:text-on-surface-variant/60"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type a message…"
          disabled={disabled}
          maxLength={4000}
        />
        <button 
          type="submit" 
          className="flex items-center justify-center w-10 h-10 rounded-full text-on-surface-variant hover:text-primary hover:bg-primary/10 transition-colors disabled:opacity-30 disabled:cursor-not-allowed" 
          disabled={disabled || !input.trim()} 
          title="Send"
        >
          <Send size={18} />
        </button>
      </form>
    </div>
  );
};
