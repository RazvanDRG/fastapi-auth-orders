import { useState } from 'react';
import { Button } from '../components/common/Button';
import { Card } from '../components/common/Card';
import { InputField } from '../components/common/InputField';
import { SectionHeader } from '../components/common/SectionHeader';
import { http } from '../lib/http';
import { getErrorMessage } from '../lib/utils';
import type { Role } from '../types/api';

export function AdminPage() {
  const [userId, setUserId] = useState('');
  const [role, setRole] = useState<Role>('operator');
  const [result, setResult] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState<string | null>(null);

  const updateRole = async () => {
    setError('');
    setResult('');
    setLoading('role');
    try {
      const { data } = await http.patch(`/users/${userId}/role`, { role });
      setResult(JSON.stringify(data, null, 2));
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(null);
    }
  };

  const deleteUser = async () => {
    setError('');
    setResult('');
    setLoading('delete');
    try {
      const { data } = await http.delete(`/users/${userId}`);
      setResult(JSON.stringify(data, null, 2));
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="page-stack">
      <SectionHeader
        title="Admin controls"
        subtitle="The API exposes mutate-only user endpoints, so the UI is intentionally targeted by explicit user ID."
      />

      <Card>
        <div className="grid-2">
          <InputField label="User ID" type="number" value={userId} onChange={(e) => setUserId(e.target.value)} />
          <label className="field">
            <span className="field-label">New role</span>
            <select className="input" value={role} onChange={(e) => setRole(e.target.value as Role)}>
              <option value="admin">admin</option>
              <option value="operator">operator</option>
              <option value="service">service</option>
            </select>
          </label>
        </div>

        <div className="action-grid two">
          <Button onClick={updateRole} disabled={!userId || loading !== null}>
            {loading === 'role' ? 'Updating...' : 'Patch role'}
          </Button>
          <Button variant="danger" onClick={deleteUser} disabled={!userId || loading !== null}>
            {loading === 'delete' ? 'Deleting...' : 'Soft delete user'}
          </Button>
        </div>

        {error ? <div className="alert alert-danger">{error}</div> : null}
        {result ? <pre className="code-block">{result}</pre> : null}
      </Card>
    </div>
  );
}
