import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '../components/common/Button';
import { Card } from '../components/common/Card';
import { InputField } from '../components/common/InputField';
import { useAuth } from '../hooks/useAuth';
import { getErrorMessage } from '../lib/utils';

export function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    email: '',
    password: '',
    first_name: '',
    last_name: '',
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
      const response = await register({
        ...form,
        first_name: form.first_name || undefined,
        last_name: form.last_name || undefined,
      });
      setMessage(response.message);
      setTimeout(() => navigate('/login'), 1000);
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
          <h1>Create operator account</h1>
          <p>Registration defaults to the operator role in the backend.</p>
        </div>

        <form onSubmit={handleSubmit} className="form-stack">
          <InputField label="Email" type="email" required value={form.email} onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))} />
          <InputField label="Password" type="password" required value={form.password} onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))} />
          <div className="grid-2">
            <InputField label="First name" value={form.first_name} onChange={(e) => setForm((p) => ({ ...p, first_name: e.target.value }))} />
            <InputField label="Last name" value={form.last_name} onChange={(e) => setForm((p) => ({ ...p, last_name: e.target.value }))} />
          </div>

          {message ? <div className="alert alert-success">{message}. Redirecting to login...</div> : null}
          {error ? <div className="alert alert-danger">{error}</div> : null}

          <Button type="submit" fullWidth disabled={loading}>
            {loading ? 'Creating...' : 'Create account'}
          </Button>
        </form>

        <div className="auth-links single">
          <Link to="/login">Back to login</Link>
        </div>
      </Card>
    </div>
  );
}
