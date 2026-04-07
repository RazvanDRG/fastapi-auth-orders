export function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="section-header">
      <div>
        <h2>{title}</h2>
        {subtitle ? <p>{subtitle}</p> : null}
      </div>
    </div>
  );
}
