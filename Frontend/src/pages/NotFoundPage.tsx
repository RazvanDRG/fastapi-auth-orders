import { Link } from 'react-router-dom';
import { Card } from '../components/common/Card';

export function NotFoundPage() {
  return (
    <div className="auth-page">
      <Card className="auth-card">
        <h1>Page not found</h1>
        <p>The route does not exist.</p>
        <Link to="/dashboard">Go to dashboard</Link>
      </Card>
    </div>
  );
}
