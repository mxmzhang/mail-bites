import React, { useState, useEffect } from "react";
import "./App.css";
import { marked } from "marked";

interface Email {
  id: string;
  subject: string;
  from: string;
  to?: string;
  date: string;
  receivedDate?: string;
  snippet: string;
  body?: string;
  isUnread: boolean;
  isImportant?: boolean;
  isPrimary?: boolean;
  isRecent?: boolean;
  inboxType?: string;
  priorityScore?: number;
  priorityReasoning?: string;
  suggestedResponseTime?: string;
}

interface EmailSummary {
  summary: string;
  tags: string[];
}

interface EmailListProps {
  emails: Email[];
  onSelectEmail: (email: Email) => void;
  loading: boolean;
  unreadCount: number;
  totalCount?: number;
  sortByPriority: boolean;
  summary?: EmailSummary[];
}

interface EmailDetailProps {
  email: Email;
  onBack: () => void;
  onMarkAsRead: (emailId: string) => void;
}

interface AuthButtonProps {
  onAuth: () => void;
  loading: boolean;
}

// Extract name from email address string
const extractName = (fromString: string): string => {
  const match = fromString.match(/^"?([^"<]+)"?\s*<?.*>?$/);
  return match ? match[1].trim() : fromString;
};

// Format date for display
const formatDate = (dateString: string): string => {
  if (!dateString) return '';
  
  try {
    const date = new Date(dateString);
    const now = new Date();
    const timeFormat = { hour: '2-digit', minute: '2-digit' } as const;
    
    // Today
    if (date.toDateString() === now.toDateString()) {
      return date.toLocaleTimeString([], timeFormat);
    }
    
    // This year
    if (date.getFullYear() === now.getFullYear()) {
      return `${date.toLocaleDateString([], { month: 'short', day: 'numeric' })} ${date.toLocaleTimeString([], timeFormat)}`;
    }
    
    // Different year
    return `${date.toLocaleDateString([], { year: 'numeric', month: 'short', day: 'numeric' })} ${date.toLocaleTimeString([], timeFormat)}`;
  } catch (error) {
    return dateString;
  }
};

// EmailList component
const EmailList: React.FC<EmailListProps> = ({ emails, onSelectEmail, loading, unreadCount, totalCount, sortByPriority, summary }) => {
  console.log('EmailList received summary:', summary); // Debug log

  return (
    <div>
      {loading ? (
        <div className="loading">Loading unread emails...</div>
      ) : emails.length === 0 ? (
        <div className="no-emails">No unread emails in Primary inbox in the last 24 hours</div>
      ) : (
        <div className="email-list">
          <h2>Primary Unread Emails ({unreadCount})</h2>
          <div className="email-subtitle">
            From the last 24 hours
            {totalCount && totalCount > unreadCount && (
              <span className="filter-info">
                (Filtered {totalCount - unreadCount} non-Primary emails)
              </span>
            )}
          </div>
          
          {summary && summary.length > 0 && (
            <div className="email-summary">
              <h3>Summary of Unread Emails</h3>
              <div className="summary-content">
                {summary.map((item, index) => {
                  console.log('Rendering summary item:', item); // Debug log
                  return (
                    <div key={index} className="summary-item">
                      <div>{item.summary}</div>
                      {item.tags && item.tags.length > 0 && (
                        <div className="summary-tags">
                          {item.tags.map((tag, tagIndex) => (
                            <span
                              key={tagIndex}
                              className={`summary-tag tag-${tag}`}
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          
          {emails.map((email) => (
            <div 
              key={email.id}
              className={`email-item ${email.isUnread ? 'unread' : ''} ${email.isImportant ? 'important' : ''} ${sortByPriority ? `priority-${Math.ceil(email.priorityScore || 5)}` : 'chronological-sort'}`}
              onClick={() => onSelectEmail(email)}
            >
              <div className="email-header-row">
                {sortByPriority && (
                  <div className="email-priority-badge">
                    Priority: {email.priorityScore || '-'}/10
                  </div>
                )}
                <div className={`email-date ${!sortByPriority ? 'full-width' : ''}`}>{formatDate(email.date)}</div>
              </div>
              <div className="email-sender">{extractName(email.from)}</div>
              <div className="email-subject">{email.subject}</div>
              <div className="email-snippet">{email.snippet}</div>
              {sortByPriority && email.suggestedResponseTime && (
                <div className="response-time">
                  Respond {email.suggestedResponseTime}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// EmailDetail component
const EmailDetail: React.FC<EmailDetailProps> = ({ email, onBack, onMarkAsRead }) => {
  // Mark as read when viewing
  useEffect(() => {
    if (email.isUnread) {
      onMarkAsRead(email.id);
    }
  }, [email.id, email.isUnread, onMarkAsRead]);

  return (
    <div className="email-detail">
      <button className="back-button" onClick={onBack}>
        ← Back to Primary Inbox
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
            <strong>Date:</strong> {formatDate(email.date)}
          </div>
          {email.inboxType && (
            <div className="email-inbox-type">
              <strong>Category:</strong> {email.inboxType}
            </div>
          )}
          <div className="email-priority">
            <strong>Priority:</strong> {email.priorityScore}/10
            {email.suggestedResponseTime && (
              <span className="suggested-response"> - Respond {email.suggestedResponseTime}</span>
            )}
          </div>
          {email.priorityReasoning && (
            <div className="email-priority-reasoning">
              <strong>Analysis:</strong> {email.priorityReasoning}
            </div>
          )}
        </div>
      </div>
      <div className="email-body">
        {email.body ? (
          <div dangerouslySetInnerHTML={{ __html: email.body.replace(/\n/g, '<br/>') }} />
        ) : (
          <div>{email.snippet}...</div>
        )}
      </div>
    </div>
  );
};

const AuthButton: React.FC<AuthButtonProps> = ({ onAuth, loading }) => (
  <div className="auth-container">
    <h2>Connect to Gmail</h2>
    <p>
      Mail Bites needs permission to access your Gmail account to show your unread emails from your Primary inbox.
      Your data is processed locally and never stored on external servers.
    </p>
    <button 
      className="auth-button"
      onClick={onAuth}
      disabled={loading}
    >
      {loading ? 'Connecting...' : 'Connect to Gmail'}
    </button>
  </div>
);

function App() {
  const [authenticated, setAuthenticated] = useState<boolean>(false);
  const [emails, setEmails] = useState<Email[]>([]);
  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState<number>(0);
  const [totalCount, setTotalCount] = useState<number>(0);
  const [token, setToken] = useState<string| null>(null);
  const [sortByPriority, setSortByPriority] = useState<boolean>(false);
  const [summary, setSummary] = useState<EmailSummary[] | undefined>(undefined);
  const [showTodo, setShowTodo] = useState(false);
  const [todos, setTodos] = useState<{ task: string; done: boolean }[]>([]);
  const [loadingTodos, setLoadingTodos] = useState(false);

  


  // Check authentication status on component mount
  useEffect(() => {
    chrome.storage.local.get(['authenticated'], (result) => {
      setAuthenticated(result.authenticated || false);
      
      // If already authenticated, fetch emails
      if (result.authenticated) {
        handleAuth();
      }
    });
  }, []);

  // Handle authentication
  const handleAuth = () => {
    setLoading(true);
    setError(null);
    
    try {
      chrome.runtime.sendMessage({ action: 'authenticate' }, (response) => {
        // Chrome runtime errors won't throw exceptions, they create lastError
        if (chrome.runtime.lastError) {
          console.error('Runtime error:', chrome.runtime.lastError);
          setError(chrome.runtime.lastError.message || 'Authentication failed. Try reloading the extension.');
          setLoading(false);
          return;
        }
        
        // Check the response from background script
        if (response?.token) {
          setAuthenticated(true);
          setToken(response.token);
          fetchEmails(response.token);
        } else if (response?.error) {
          console.error('Authentication error:', response.error);
          setError(response.error);
          setLoading(false);
        } else {
          setError('Unknown authentication error. Please reload the extension.');
          setLoading(false);
        }
      });
    } catch (err) {
      // Catch any unexpected errors 
      console.error('Unexpected error during authentication:', err);
      setError('Unexpected error. Please try again or reload the extension.');
      setLoading(false);
    }
  };

  // Fetch emails using the Gmail API
  const fetchEmails = (token: string) => {
    setLoading(true);
    
    try {
      chrome.runtime.sendMessage({ 
        action: 'getEmails',
        token
      }, (response) => {
        // Chrome runtime errors won't throw exceptions, they create lastError
        if (chrome.runtime.lastError) {
          console.error('Runtime error:', chrome.runtime.lastError);
          setError(chrome.runtime.lastError.message || 'Failed to fetch emails. Try reloading the extension.');
          setLoading(false);
          return;
        }
        
        // Check the response from background script
        if (response?.emails) {
          setEmails(response.emails);
          setUnreadCount(response.unreadCount || response.emails.length);
          setTotalCount(response.totalCount || response.emails.length);
          setSummary(response.summary);
          setLoading(false);
        } else if (response?.error) {
          console.error('Error fetching emails:', response.error);
          setError(response.error);
          setLoading(false);
        } else {
          setError('Unknown error fetching emails. Please reload the extension.');
          setLoading(false);
        }
      });
    } catch (err) {
      // Catch any unexpected errors
      console.error('Unexpected error fetching emails:', err);
      setError('Unexpected error. Please try again or reload the extension.');
      setLoading(false);
    }
  };

  // Handle email selection
  const handleSelectEmail = (email: Email) => {
    setSelectedEmail(email);
  };

  // Handle back button click
  const handleBack = () => {
    setSelectedEmail(null);
  };

  // Mark email as read
  const handleMarkAsRead = (emailId: string) => {
    // Update local state
    setEmails(prevEmails => 
      prevEmails.map(email => 
        email.id === emailId ? { ...email, isUnread: false } : email
      )
    );
    
    // Future implementation could update the read status on Gmail
    // using https://developers.google.com/gmail/api/reference/rest/v1/users.messages/modify
  };

  // Refresh emails
  // const handleRefresh = () => {
  //   if (authenticated) {
  //     chrome.runtime.sendMessage({ action: 'authenticate' }, (response) => {
  //       if (response?.token) {
  //         fetchEmails(response.token);
  //       }
  //     });
  //   }
  // };
  const handleRefresh = () => {
    if (token) {
      fetchEmails(token);
    }
  };

  // Toggle sort order
  const toggleSortOrder = () => {
    setSortByPriority(prev => !prev);
  };

  //for to-do list
  const handleGenerateTodos = () => {
    setShowTodo(true);
    setLoadingTodos(true);
  
    chrome.runtime.sendMessage({ action: "getTodos", token }, (response) => {
      if (chrome.runtime.lastError) {
        console.error("Runtime error:", chrome.runtime.lastError.message);
        setLoadingTodos(false);
        return;
      }
    
      console.log("Got todo response:", response);
    
      if (response?.todos?.length) {
        setTodos(response.todos);
      } else {
        console.warn("No todos returned");
        setTodos([]);
      }
    
      setLoadingTodos(false);
    });
  };
  
  

  return (
    <div className="App">
      <header className="App-header">
        <h1>Mail Bites</h1>
        {authenticated && (
          <div className="header-buttons">
          <button className="refresh-button" onClick={handleRefresh} disabled={showTodo || loading}>
            ↻ Refresh
          </button>
          <button className="sort-button" onClick={handleGenerateTodos} >
            View To-Do List
          </button>
          <button className="sort-button" onClick={toggleSortOrder} disabled={showTodo}>
            {sortByPriority ? "Sort Chronologically" : "Sort By Priority"}
          </button>
        </div>
        )}
      </header>
      
      <main className="App-content">
        {error && (
          <div className="error-message">
            {error}
            <button className="retry-button" onClick={() => window.location.reload()}>
              Reload Extension
            </button>
          </div>
        )}
        {!authenticated ? (
          <AuthButton onAuth={handleAuth} loading={loading} />
          //to-do list
        ) : showTodo ? (
          <div className="todo-list">
            <button className="back-button" onClick={() => setShowTodo(false)}>
          ← Back to Inbox
            </button>
          <h2>Email To-Do List</h2>
          {todos.length === 0 ? (
          <p>No actionable tasks found.</p>
            ) : (
          <ul className="todo-bullet-list">
            {todos.map((item, index) => (
            <li key={index} className="todo-bullet-item">
              {item.task}
            </li>
          ))}
          </ul>
          )}

        </div>
        ) : selectedEmail ? (
          <EmailDetail 
            email={selectedEmail} 
            onBack={handleBack} 
            onMarkAsRead={handleMarkAsRead}
          />
        ) : (
          <EmailList 
            emails={sortByPriority 
              ? [...emails].sort((a, b) => (b.priorityScore || 5) - (a.priorityScore || 5))
              : [...emails].sort((a, b) => new Date(b.receivedDate || b.date).getTime() - new Date(a.receivedDate || a.date).getTime())} 
            onSelectEmail={handleSelectEmail} 
            loading={loading}
            unreadCount={unreadCount}
            totalCount={totalCount}
            sortByPriority={sortByPriority}
            summary={summary}
          />
        )}
      </main>
    </div>
  );
}

export default App;
