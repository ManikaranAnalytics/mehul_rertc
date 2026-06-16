import React, { useCallback, useEffect, useState } from 'react';
import {
  Plus,
  Search,
  Pencil,
  Trash2,
  KeyRound,
  UserCheck,
  UserX,
  Lock,
} from 'lucide-react';
import {
  activateUser,
  createUser,
  deactivateUser,
  deleteUser,
  fetchUsers,
  lockUser,
  resetUserPassword,
  updateUser,
  type AdminUser,
} from '../api/adminApi';

function StatusBadge({ status }: { status: AdminUser['login_status'] }) {
  const cls =
    status === 'ACTIVE' ? 'admin-badge--active'
      : status === 'INACTIVE' ? 'admin-badge--inactive'
        : 'admin-badge--locked';
  return <span className={`admin-badge ${cls}`}>{status}</span>;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString();
}

interface ModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}

function Modal({ open, title, onClose, children }: ModalProps) {
  if (!open) return null;
  return (
    <div className="admin-modal-overlay" onClick={onClose}>
      <div className="admin-modal" onClick={(e) => e.stopPropagation()} role="dialog">
        <div className="admin-modal__header">
          <h2>{title}</h2>
          <button type="button" className="admin-modal__close" onClick={onClose}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const [createOpen, setCreateOpen] = useState(false);
  const [editUser, setEditUser] = useState<AdminUser | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminUser | null>(null);
  const [resetTarget, setResetTarget] = useState<AdminUser | null>(null);

  const [formUsername, setFormUsername] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [formStatus, setFormStatus] = useState<'ACTIVE' | 'INACTIVE' | 'LOCKED'>('ACTIVE');

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchUsers(page, 10, search);
      setUsers(data.items);
      setTotal(data.total);
      setTotalPages(data.total_pages);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load users');
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => { void loadUsers(); }, [loadUsers]);

  const resetForm = () => {
    setFormUsername('');
    setFormPassword('');
    setFormStatus('ACTIVE');
  };

  const openCreate = () => {
    resetForm();
    setCreateOpen(true);
  };

  const openEdit = (user: AdminUser) => {
    setFormUsername(user.username);
    setFormPassword('');
    setFormStatus(user.login_status);
    setEditUser(user);
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createUser({ username: formUsername, password: formPassword, login_status: formStatus });
      setCreateOpen(false);
      setMessage('User created successfully');
      void loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Create failed');
    }
  };

  const handleEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editUser) return;
    try {
      const payload: Partial<{ username: string; password: string; login_status: string }> = {
        username: formUsername,
        login_status: formStatus,
      };
      if (formPassword) payload.password = formPassword;
      await updateUser(editUser.id, payload);
      setEditUser(null);
      setMessage('User updated successfully');
      void loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed');
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteUser(deleteTarget.id);
      setDeleteTarget(null);
      setMessage('User deleted');
      void loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetTarget) return;
    try {
      await resetUserPassword(resetTarget.id, formPassword);
      setResetTarget(null);
      setMessage('Password reset successfully');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reset failed');
    }
  };

  const runAction = async (action: () => Promise<unknown>, successMsg: string) => {
    try {
      await action();
      setMessage(successMsg);
      void loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed');
    }
  };

  return (
    <div className="admin-page">
      <div className="admin-page__header admin-page__header--row">
        <div>
          <h1>User Management</h1>
          <p>Create and manage application user accounts</p>
        </div>
        <button type="button" className="admin-btn admin-btn--primary" onClick={openCreate}>
          <Plus size={16} />
          Create User
        </button>
      </div>

      {error && <div className="admin-alert admin-alert--error">{error}</div>}
      {message && <div className="admin-alert admin-alert--success">{message}</div>}

      <div className="admin-toolbar">
        <div className="admin-search">
          <Search size={16} />
          <input
            type="text"
            placeholder="Search by username…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { setPage(1); setSearch(searchInput); }
            }}
          />
          <button type="button" className="admin-btn" onClick={() => { setPage(1); setSearch(searchInput); }}>
            Search
          </button>
        </div>
        <span className="admin-toolbar__meta">{total} user{total !== 1 ? 's' : ''}</span>
      </div>

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Username</th>
              <th>Status</th>
              <th>Created</th>
              <th>Updated</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="admin-table__empty">Loading…</td></tr>
            ) : users.length === 0 ? (
              <tr><td colSpan={6} className="admin-table__empty">No users found</td></tr>
            ) : users.map((user) => (
              <tr key={user.id}>
                <td>{user.id}</td>
                <td>{user.username}</td>
                <td><StatusBadge status={user.login_status} /></td>
                <td>{formatDate(user.created_at)}</td>
                <td>{formatDate(user.updated_at)}</td>
                <td>
                  <div className="admin-actions">
                    <button type="button" title="Edit" onClick={() => openEdit(user)}><Pencil size={14} /></button>
                    <button type="button" title="Reset Password" onClick={() => { setFormPassword(''); setResetTarget(user); }}><KeyRound size={14} /></button>
                    {user.login_status !== 'ACTIVE' && (
                      <button type="button" title="Activate" onClick={() => void runAction(() => activateUser(user.id), 'User activated')}><UserCheck size={14} /></button>
                    )}
                    {user.login_status !== 'INACTIVE' && (
                      <button type="button" title="Deactivate" onClick={() => void runAction(() => deactivateUser(user.id), 'User deactivated')}><UserX size={14} /></button>
                    )}
                    {user.login_status !== 'LOCKED' && (
                      <button type="button" title="Lock" onClick={() => void runAction(() => lockUser(user.id), 'User locked')}><Lock size={14} /></button>
                    )}
                    <button type="button" title="Delete" className="admin-actions__danger" onClick={() => setDeleteTarget(user)}><Trash2 size={14} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="admin-pagination">
        <button type="button" className="admin-btn" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</button>
        <span>Page {page} of {totalPages}</span>
        <button type="button" className="admin-btn" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>Next</button>
      </div>

      <Modal open={createOpen} title="Create User" onClose={() => setCreateOpen(false)}>
        <form onSubmit={handleCreate} className="admin-form">
          <label>Username<input value={formUsername} onChange={(e) => setFormUsername(e.target.value)} required /></label>
          <label>Password<input type="password" value={formPassword} onChange={(e) => setFormPassword(e.target.value)} required minLength={6} /></label>
          <label>Status
            <select value={formStatus} onChange={(e) => setFormStatus(e.target.value as typeof formStatus)}>
              <option value="ACTIVE">ACTIVE</option>
              <option value="INACTIVE">INACTIVE</option>
              <option value="LOCKED">LOCKED</option>
            </select>
          </label>
          <div className="admin-form__actions">
            <button type="button" className="admin-btn" onClick={() => setCreateOpen(false)}>Cancel</button>
            <button type="submit" className="admin-btn admin-btn--primary">Create</button>
          </div>
        </form>
      </Modal>

      <Modal open={!!editUser} title="Edit User" onClose={() => setEditUser(null)}>
        <form onSubmit={handleEdit} className="admin-form">
          <label>Username<input value={formUsername} onChange={(e) => setFormUsername(e.target.value)} required /></label>
          <label>New Password <small>(leave blank to keep)</small><input type="password" value={formPassword} onChange={(e) => setFormPassword(e.target.value)} minLength={6} /></label>
          <label>Status
            <select value={formStatus} onChange={(e) => setFormStatus(e.target.value as typeof formStatus)}>
              <option value="ACTIVE">ACTIVE</option>
              <option value="INACTIVE">INACTIVE</option>
              <option value="LOCKED">LOCKED</option>
            </select>
          </label>
          <div className="admin-form__actions">
            <button type="button" className="admin-btn" onClick={() => setEditUser(null)}>Cancel</button>
            <button type="submit" className="admin-btn admin-btn--primary">Save</button>
          </div>
        </form>
      </Modal>

      <Modal open={!!deleteTarget} title="Delete User" onClose={() => setDeleteTarget(null)}>
        <p>Delete user <strong>{deleteTarget?.username}</strong>? This cannot be undone.</p>
        <div className="admin-form__actions">
          <button type="button" className="admin-btn" onClick={() => setDeleteTarget(null)}>Cancel</button>
          <button type="button" className="admin-btn admin-btn--danger" onClick={() => void handleDelete()}>Delete</button>
        </div>
      </Modal>

      <Modal open={!!resetTarget} title="Reset Password" onClose={() => setResetTarget(null)}>
        <form onSubmit={handleResetPassword} className="admin-form">
          <p>Reset password for <strong>{resetTarget?.username}</strong></p>
          <label>New Password<input type="password" value={formPassword} onChange={(e) => setFormPassword(e.target.value)} required minLength={6} /></label>
          <div className="admin-form__actions">
            <button type="button" className="admin-btn" onClick={() => setResetTarget(null)}>Cancel</button>
            <button type="submit" className="admin-btn admin-btn--primary">Reset</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
