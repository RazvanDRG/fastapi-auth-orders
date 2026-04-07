export function Loader({ label = 'Loading...' }: { label?: string }) {
  return (
    <div className="loader-wrap">
      <div className="loader" />
      <span>{label}</span>
    </div>
  );
}
