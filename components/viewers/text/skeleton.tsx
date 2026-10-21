export function TextSkeleton() {
  return (
    <div className="mx-auto max-w-3xl space-y-3 px-8 py-10">
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i} className="skeleton h-4 rounded" style={{ width: `${60 + ((i * 37) % 40)}%` }} />
      ))}
    </div>
  );
}
