import { useCallback, useEffect, useRef, useState } from 'react';
import { LogOut, User } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

export default function UserProfileMenu() {
  const { username, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const closeMenu = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        closeMenu();
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeMenu();
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, closeMenu]);

  const handleLogout = () => {
    closeMenu();
    logout();
    navigate('/login', { replace: true });
  };

  const displayName = username ?? 'User';
  const initials = displayName
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('') || 'U';

  return (
    <div className="user-profile-menu" ref={menuRef}>
      <button
        type="button"
        className={`user-profile-menu__trigger ${open ? 'user-profile-menu__trigger--open' : ''}`}
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`User profile menu for ${displayName}`}
      >
        <span className="user-profile-menu__avatar">{initials}</span>
      </button>

      {open && (
        <div className="user-profile-menu__dropdown" role="menu">
          <div className="user-profile-menu__header">
            <div className="user-profile-menu__header-avatar">{initials}</div>
            <div className="user-profile-menu__header-text">
              <span className="user-profile-menu__label">Signed in as</span>
              <span className="user-profile-menu__username">{displayName}</span>
            </div>
          </div>

          <div className="user-profile-menu__divider" />

          <button
            type="button"
            className="user-profile-menu__item user-profile-menu__item--disabled"
            disabled
            role="menuitem"
          >
            <User size={15} />
            <span>Profile</span>
            <span className="user-profile-menu__badge">Soon</span>
          </button>

          <div className="user-profile-menu__divider" />

          <button
            type="button"
            className="user-profile-menu__item user-profile-menu__item--danger"
            onClick={handleLogout}
            role="menuitem"
          >
            <LogOut size={15} />
            <span>Logout</span>
          </button>
        </div>
      )}
    </div>
  );
}
