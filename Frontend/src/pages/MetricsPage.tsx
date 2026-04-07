import { useEffect, useState } from 'react';
import { Card } from '../components/common/Card';
import { SectionHeader } from '../components/common/SectionHeader';
import { http } from '../lib/http';
import { getErrorMessage, parseMetrics } from '../lib/utils';

export function MetricsPage() {
  const [rawMetrics, setRawMetrics] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const load = async () => {
      try {
        const { data } = await http.get<string>('/metrics', { responseType: 'text' as never });
        setRawMetrics(data);
      } catch (err) {
        setError(getErrorMessage(err));
      }
    };

    load();
  }, []);

  const metrics = parseMetrics(rawMetrics);

  return (
    <div className="page-stack">
      <SectionHeader title="Metrics" subtitle="Admin-only Prometheus endpoint preview." />

      {error ? <div className="alert alert-danger">{error}</div> : null}

      <div className="stats-grid">
        {metrics.slice(0, 6).map((metric) => (
          <Card key={metric.metric}>
            <p className="eyebrow">Metric</p>
            <h3>{metric.value}</h3>
            <p className="metric-name">{metric.metric}</p>
          </Card>
        ))}
      </div>

      <Card>
        <SectionHeader title="Raw scrape" subtitle="Useful in a backend-oriented interview discussion." />
        <pre className="code-block metrics-block">{rawMetrics || 'No metrics loaded yet.'}</pre>
      </Card>
    </div>
  );
}
