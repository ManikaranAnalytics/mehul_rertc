import { useEffect, useState } from 'react';
import { Users, UserCheck, UserX, Lock } from 'lucide-react';
import { fetchUserStats, type UserStats } from '../api/adminApi';

const CARDS = [
  { key: 'total_users' as const, label: 'Total Users', icon: Users, color: '#60a5fa' },
  { key: 'active_users' as const, label: 'Active Users', icon: UserCheck, color: '#34d399' },
  { key: 'inactive_users' as const, label: 'Inactive Users', icon: UserX, color: '#fbbf24' },
  { key: 'locked_users' as const, label: 'Locked Users', icon: Lock, color: '#f87171' },
];

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<UserStats | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchUserStats()
      .then(setStats)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load stats'));
  }, []);

  return (
    <div className="admin-page">
      <div className="admin-page__header">
        <h1>Dashboard</h1>
        <p>Overview of user accounts and system access</p>
      </div>

      {error && <div className="admin-alert admin-alert--error">{error}</div>}

      <div className="admin-stat-grid">
        {CARDS.map(({ key, label, icon: Icon, color }) => (
          <div key={key} className="admin-stat-card">
            <div className="admin-stat-card__icon" style={{ color, background: `${color}18` }}>
              <Icon size={22} />
            </div>
            <div>
              <div className="admin-stat-card__value">{stats ? stats[key] : '—'}</div>
              <div className="admin-stat-card__label">{label}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
