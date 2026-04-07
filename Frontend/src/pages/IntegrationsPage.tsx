import { useState } from 'react';
import { Button } from '../components/common/Button';
import { Card } from '../components/common/Card';
import { InputField } from '../components/common/InputField';
import { SectionHeader } from '../components/common/SectionHeader';
import { http } from '../lib/http';
import { getErrorMessage } from '../lib/utils';

export function IntegrationsPage() {
  const [orderId, setOrderId] = useState('');
  const [result, setResult] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState<string | null>(null);

  const run = async (action: 'reserve' | 'release') => {
    setError('');
    setResult('');
    setLoading(action);
    try {
      const { data } = await http.post(`/integrations/orders/${orderId}/${action}`);
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
        title="Service integrations"
        subtitle="Dedicated service-role panel for external reserve and release actions."
      />

      <Card>
        <div className="inline-form">
          <InputField label="Order ID" type="number" value={orderId} onChange={(e) => setOrderId(e.target.value)} />
          <Button onClick={() => run('reserve')} disabled={!orderId || loading !== null}>
            {loading === 'reserve' ? 'Calling...' : 'Integration reserve'}
          </Button>
          <Button variant="secondary" onClick={() => run('release')} disabled={!orderId || loading !== null}>
            {loading === 'release' ? 'Calling...' : 'Integration release'}
          </Button>
        </div>

        {error ? <div className="alert alert-danger">{error}</div> : null}
        {result ? (
          <pre className="code-block">{result}</pre>
        ) : (
          <p className="muted">Use a service account. Other roles should be blocked by the backend.</p>
        )}
      </Card>
    </div>
  );
}
