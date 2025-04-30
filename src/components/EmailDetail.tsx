import React from 'react';

interface Email {
  id: string;
  subject: string;
  from: string;
  to?: string;
  date: string;
  body?: string;
  snippet: string;
}

interface EmailDetailProps {
  email: Email;
  onBack: () => void;
}

const EmailDetail: React.FC<EmailDetailProps> = ({ email, onBack }) => {
  return (
    <div className="email-detail">
      <button className="back-button" onClick={onBack}>
        ← Back
      </button>
      
      <div className="email-header">
        <h2 className="email-subject">{email.subject}</h2>
        <div className="email-meta">
          <div className="email-from">
            <strong>From:</strong> {email.from}
          </div>
          {email.to && (
            <div className="email-to">
              <strong>To:</strong> {email.to}
            </div>
          )}
          <div className="email-date">
            <strong>Date:</strong> {formatFullDate(email.date)}
          </div>
        </div>
      </div>
      
      <div className="email-body">
        {email.body ? (
          <div dangerouslySetInnerHTML={{ __html: formatEmailBody(email.body) }} />
        ) : (
          <div>{email.snippet}...</div>
        )}
      </div>
      
      <div className="email-actions">
        <button className="action-button">
          Summarize
        </button>
        <button className="action-button">
          Extract Key Points
        </button>
      </div>
    </div>
  );
};

// Format the full date for the email detail view
function formatFullDate(dateString: string): string {
  if (!dateString) return '';
  
  try {
    const date = new Date(dateString);
    return date.toLocaleString([], {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch (error) {
    return dateString;
  }
}

// Format the email body for display
function formatEmailBody(body: string): string {
  // Basic formatting - this could be enhanced
  return body
    .replace(/\n/g, '<br/>')
    .replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank">$1</a>');
}

export default EmailDetail; 