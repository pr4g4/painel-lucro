export default function Carregando() {
  return (
    <div className="flex flex-col gap-3" aria-busy="true" aria-label="Carregando">
      <div className="skeleton h-28" />
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton h-24" />)}</div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="skeleton h-24" />)}</div>
      <div className="skeleton h-72" />
    </div>
  );
}
