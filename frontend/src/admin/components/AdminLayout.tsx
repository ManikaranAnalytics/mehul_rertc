import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  Settings,
  KeyRound,
  LogOut,
} from 'lucide-react';
import { useAdminAuth } from '../context/AdminAuthContext';

const NAV = [
  { to: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard, end: false },
  { to: '/admin/users', label: 'User Management', icon: Users, end: false },
  { to: '/admin/settings', label: 'System Settings', icon: Settings, end: false },
  { to: '/admin/credentials', label: 'Plant Credentials', icon: KeyRound, end: false },
];

export default function AdminLayout() {
  const { adminUsername, adminLogout } = useAdminAuth();
  const navigate = useNavigate();

  const initials = (adminUsername ?? 'A')
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('') || 'A';

  const handleLogout = () => {
    adminLogout();
    navigate('/admin/login', { replace: true });
  };

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <div className="admin-sidebar__brand">
          <img src="/logo.png" alt="Logo" className="admin-sidebar__logo" />
          <div>
            <div className="admin-sidebar__title">RE-RTC Admin</div>
            <div className="admin-sidebar__subtitle">Control Center</div>
          </div>
        </div>

        <nav className="admin-sidebar__nav">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) => `admin-sidebar__link ${isActive ? 'admin-sidebar__link--active' : ''}`}
            >
              <Icon size={16} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="admin-main">
        <header className="admin-topbar">
          <div className="admin-topbar__title">Administration Console</div>
          <div className="admin-topbar__user">
            <span className="admin-topbar__avatar">{initials}</span>
            <span className="admin-topbar__username">{adminUsername}</span>
            <button type="button" className="admin-topbar__logout" onClick={handleLogout}>
              <LogOut size={15} />
              <span>Logout</span>
            </button>
          </div>
        </header>

        <main className="admin-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
