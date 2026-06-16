export default function AdminPlaceholderPage({ title }: { title: string }) {
  return (
    <div className="admin-page">
      <div className="admin-page__header">
        <h1>{title}</h1>
        <p>This module will be available in a future release.</p>
      </div>
      <div className="admin-placeholder-card">
        <span>Coming Soon</span>
      </div>
    </div>
  );
}
