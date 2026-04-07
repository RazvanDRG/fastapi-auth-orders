import { useState } from 'react';
import { Button } from '../components/common/Button';
import { Card } from '../components/common/Card';
import { SectionHeader } from '../components/common/SectionHeader';
import { useAuth } from '../hooks/useAuth';
import { formatDisplayName, getErrorMessage } from '../lib/utils';

export function ProfilePage() {
  const { user, tokens, refreshProfile } = useAuth();
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  return (
    <div className="page-stack">
      <SectionHeader title="Profile" subtitle="Live session data coming from /auth/me." />

      <div className="grid-main">
        <Card>
          <div className="detail-list">
            <div>
              <span>Name</span>
              <strong>{formatDisplayName(user?.first_name, user?.last_name)}</strong>
            </div>
            <div>
              <span>Email</span>
              <strong>{user?.email}</strong>
            </div>
            <div>
              <span>Role</span>
              <strong>{user?.role}</strong>
            </div>
            <div>
              <span>User ID</span>
              <strong>{user?.id}</strong>
            </div>
          </div>

          <Button
            onClick={async () => {
              setMessage('');
              setError('');
              try {
                await refreshProfile();
                setMessage('Profile refreshed.');
              } catch (err) {
                setError(getErrorMessage(err));
              }
            }}
          >
            Refresh profile
          </Button>
          {message ? <div className="alert alert-success">{message}</div> : null}
          {error ? <div className="alert alert-danger">{error}</div> : null}
        </Card>

        <Card>
          <SectionHeader title="Session tokens" subtitle="Safe demo view. Tokens are masked on screen." />
          <div className="detail-list">
            <div>
              <span>Access token</span>
              <code>{tokens?.access_token ? `${tokens.access_token.slice(0, 24)}...` : 'Missing'}</code>
            </div>
            <div>
              <span>Refresh token</span>
              <code>{tokens?.refresh_token ? `${tokens.refresh_token.slice(0, 24)}...` : 'Missing'}</code>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
