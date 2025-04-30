import React from 'react';

interface AuthButtonProps {
  onAuth: () => void;
  loading: boolean;
}

const AuthButton: React.FC<AuthButtonProps> = ({ onAuth, loading }) => {
  return (
    <div className="auth-container">
      <h2>Connect to Gmail</h2>
      <p>
        Mail Bites needs permission to access your Gmail account to show your emails.
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
};

export default AuthButton; 