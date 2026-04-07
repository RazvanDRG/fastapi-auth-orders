import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../components/common/Button';
import { Card } from '../components/common/Card';
import { InputField } from '../components/common/InputField';
import { useAuth } from '../hooks/useAuth';
import { getErrorMessage } from '../lib/utils';

export function ForgotPasswordPage() {
  const { forgotPassword } = useAuth();
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);

    try {
      const response = await forgotPassword({ email });
      setMessage(response.message);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      <Card className="auth-card">
        <div className="auth-header">
          <h1>Forgot password</h1>
          <p>The backend sends a six-digit reset code if the account exists.</p>
        </div>
        <form onSubmit={handleSubmit} className="form-stack">
          <InputField label="Account email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          {message ? <div className="alert alert-success">{message}</div> : null}
          {error ? <div className="alert alert-danger">{error}</div> : null}
          <Button type="submit" fullWidth disabled={loading}>{loading ? 'Submitting...' : 'Send reset code'}</Button>
        </form>
        <div className="auth-links single">
          <Link to="/reset-password">Already have the code?</Link>
        </div>
      </Card>
    </div>
  );
}
