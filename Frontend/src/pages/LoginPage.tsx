import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Button } from '../components/common/Button';
import { Card } from '../components/common/Card';
import { InputField } from '../components/common/InputField';
import { useAuth } from '../hooks/useAuth';
import { getErrorMessage } from '../lib/utils';

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const from = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname || '/dashboard';

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setLoading(true);

    try {
      await login(form);
      navigate(from, { replace: true });
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
          <h1>Warehouse Ops Console</h1>
          <p>Log in with an existing account and continue the order workflow.</p>
        </div>

        <form onSubmit={handleSubmit} className="form-stack">
          <InputField
            label="Email"
            type="email"
            value={form.email}
            onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
            required
            placeholder="admin@example.com"
          />
          <InputField
            label="Password"
            type="password"
            value={form.password}
            onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))}
            required
            placeholder="Minimum 8 characters"
          />

          {error ? <div className="alert alert-danger">{error}</div> : null}

          <Button type="submit" fullWidth disabled={loading}>
            {loading ? 'Signing in...' : 'Sign in'}
          </Button>
        </form>

        <div className="auth-links">
          <Link to="/register">Create account</Link>
          <Link to="/forgot-password">Forgot password?</Link>
        </div>
      </Card>
    </div>
  );
}
