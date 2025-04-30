import React from 'react';

interface Email {
  id: string;
  subject: string;
  from: string;
  date: string;
  snippet: string;
}

interface EmailListProps {
  emails: Email[];
  onSelectEmail: (email: Email) => void;
  loading: boolean;
}

const EmailList: React.FC<EmailListProps> = ({ emails, onSelectEmail, loading }) => {
  if (loading) {
    return <div className="loading">Loading emails...</div>;
  }

  if (emails.length === 0) {
    return <div className="no-emails">No emails found</div>;
  }

  return (
    <div className="email-list">
      <h2>Recent Emails</h2>
      <div className="email-items">
        {emails.map((email) => (
          <div 
            key={email.id}
            className="email-item"
            onClick={() => onSelectEmail(email)}
          >
            <div className="email-sender">{extractName(email.from)}</div>
            <div className="email-subject">{email.subject}</div>
            <div className="email-snippet">{email.snippet}</div>
            <div className="email-date">{formatDate(email.date)}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

// Helper function to extract name from email
function extractName(fromString: string): string {
  const match = fromString.match(/^"?([^"<]+)"?\s*<?.*>?$/);
  return match ? match[1].trim() : fromString;
}

// Helper function to format date
function formatDate(dateString: string): string {
  if (!dateString) return '';
  
  try {
    const date = new Date(dateString);
    const now = new Date();
    
    // Today
    if (date.toDateString() === now.toDateString()) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    
    // This year
    if (date.getFullYear() === now.getFullYear()) {
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }
    
    // Different year
    return date.toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' });
  } catch (error) {
    return dateString;
  }
}

export default EmailList; 