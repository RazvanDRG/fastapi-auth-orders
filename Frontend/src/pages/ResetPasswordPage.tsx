import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '../components/common/Button';
import { Card } from '../components/common/Card';
import { InputField } from '../components/common/InputField';
import { useAuth } from '../hooks/useAuth';
import { getErrorMessage } from '../lib/utils';

export function ResetPasswordPage() {
  const { resetPassword } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    email: '',
    code: '',
    new_password: '',
    confirm_password: '',
  });
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);

    try {
      const response = await resetPassword(form);
      setMessage(response.message);
      setTimeout(() => navigate('/login'), 1200);
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
          <h1>Reset password</h1>
          <p>Use the six-digit code received by email and choose a new password.</p>
        </div>
        <form onSubmit={handleSubmit} className="form-stack">
          <InputField label="Email" type="email" value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} required />
          <InputField label="Reset code" value={form.code} onChange={(e) => setForm((p) => ({ ...p, code: e.target.value }))} maxLength={6} required />
          <InputField label="New password" type="password" value={form.new_password} onChange={(e) => setForm((p) => ({ ...p, new_password: e.target.value }))} required />
          <InputField label="Confirm new password" type="password" value={form.confirm_password} onChange={(e) => setForm((p) => ({ ...p, confirm_password: e.target.value }))} required />
          {message ? <div className="alert alert-success">{message}. Redirecting to login...</div> : null}
          {error ? <div className="alert alert-danger">{error}</div> : null}
          <Button type="submit" fullWidth disabled={loading}>{loading ? 'Resetting...' : 'Reset password'}</Button>
        </form>
        <div className="auth-links single">
          <Link to="/login">Back to login</Link>
        </div>
      </Card>
    </div>
  );
}
