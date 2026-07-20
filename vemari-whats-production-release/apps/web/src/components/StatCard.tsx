import { ReactNode } from 'react';

export function StatCard({ label, value, helper, icon }: { label: string; value: string | number; helper?: string; icon?: ReactNode }) {
  return (
    <article className="stat-card">
      <div className="stat-icon" aria-hidden="true">{icon}</div>
      <div><p>{label}</p><strong>{value}</strong>{helper && <span>{helper}</span>}</div>
    </article>
  );
}
