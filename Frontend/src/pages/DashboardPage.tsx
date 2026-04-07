import { useEffect, useState } from 'react';
import { Card } from '../components/common/Card';
import { SectionHeader } from '../components/common/SectionHeader';
import { Badge } from '../components/common/Badge';
import { http } from '../lib/http';
import { getErrorMessage } from '../lib/utils';
import { useAuth } from '../hooks/useAuth';
import type { OpsLiveResponse, OpsReadyResponse } from '../types/api';

export function DashboardPage() {
  const { user } = useAuth();
  const [live, setLive] = useState<OpsLiveResponse | null>(null);
  const [ready, setReady] = useState<OpsReadyResponse | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchHealth = async () => {
      try {
        const [liveResponse, readyResponse] = await Promise.all([
          http.get<OpsLiveResponse>('/ops/live'),
          http.get<OpsReadyResponse>('/ops/ready'),
        ]);
        setLive(liveResponse.data);
        setReady(readyResponse.data);
      } catch (err) {
        setError(getErrorMessage(err));
      }
    };

    fetchHealth();
  }, []);

  const capabilities = [
    'JWT login with refresh token rotation',
    'Forgot/reset password flow',
    'Order state machine controls',
    'RBAC-aware navigation',
    'Admin user role mutation and soft delete',
    'Service-only integration trigger panel',
    'Protected metrics reader for admins',
  ];

  return (
    <div className="page-stack">
      <SectionHeader
        title="System dashboard"
        subtitle="High-signal overview for a technical demo or interview walkthrough."
      />

      <div className="stats-grid">
        <Card>
          <p className="eyebrow">Current role</p>
          <h3>{user?.role}</h3>
          <p>Navigation is filtered directly from backend RBAC expectations.</p>
        </Card>
        <Card>
          <p className="eyebrow">Liveness</p>
          <h3>{live?.status ?? '...'}</h3>
          <p>{live?.app ?? 'Waiting for /ops/live response'}</p>
        </Card>
        <Card>
          <p className="eyebrow">Readiness</p>
          <h3>{ready?.db ?? '...'}</h3>
          <p>Database readiness probe.</p>
        </Card>
      </div>

      {error ? <div className="alert alert-danger">{error}</div> : null}

      <div className="grid-main">
        <Card>
          <SectionHeader title="Endpoint coverage" subtitle="Every backend route is surfaced in the UI." />
          <div className="chips">
            <Badge tone="success">/auth/*</Badge>
            <Badge tone="info">/ops/*</Badge>
            <Badge tone="warning">/orders/*</Badge>
            <Badge tone="neutral">/integrations/*</Badge>
            <Badge tone="danger">/users/*</Badge>
            <Badge tone="info">/metrics</Badge>
          </div>
          <ul className="bullet-list">
            {capabilities.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </Card>

        <Card>
          <SectionHeader title="Reality check" subtitle="What the backend does not expose is handled honestly." />
          <ul className="bullet-list">
            <li>There is no order list endpoint, so orders are created or looked up by ID.</li>
            <li>There is no users list endpoint, so admin actions are targeted by explicit user ID.</li>
            <li>Integration actions are isolated to the service role, matching the API contract.</li>
          </ul>
        </Card>
      </div>
    </div>
  );
}
