import { Activity, Gauge, LogOut, Package2, Shield, UserCircle2, Wrench } from 'lucide-react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { Badge } from '../common/Badge';
import { Button } from '../common/Button';
import { formatDisplayName } from '../../lib/utils';

export function AppShell() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const items = [
    { to: '/dashboard', label: 'Dashboard', icon: Activity, roles: ['admin', 'operator', 'service'] },
    { to: '/orders', label: 'Orders', icon: Package2, roles: ['admin', 'operator'] },
    { to: '/metrics', label: 'Metrics', icon: Gauge, roles: ['admin'] },
    { to: '/integrations', label: 'Integrations', icon: Wrench, roles: ['service'] },
    { to: '/admin', label: 'Admin', icon: Shield, roles: ['admin'] },
    { to: '/profile', label: 'Profile', icon: UserCircle2, roles: ['admin', 'operator', 'service'] },
  ].filter((item) => (user ? item.roles.includes(user.role) : false));

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">WO</div>
          <div>
            <h1>Warehouse Ops</h1>
            <p>Interview Console</p>
          </div>
        </div>

        <nav className="nav">
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
              >
                <Icon size={18} />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>

        <div className="sidebar-user">
          <div>
            <strong>{formatDisplayName(user?.first_name, user?.last_name)}</strong>
            <p>{user?.email}</p>
          </div>
          <Badge tone="info">{user?.role}</Badge>
        </div>

        <Button
          variant="ghost"
          className="logout-btn"
          onClick={async () => {
            await logout();
            navigate('/login', { replace: true });
          }}
        >
          <LogOut size={16} />
          Sign out
        </Button>
      </aside>

      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
