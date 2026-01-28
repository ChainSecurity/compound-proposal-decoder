export function LoadingSkeleton() {
  return (
    <div className="space-y-8 animate-pulse">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="bg-white rounded-2xl border border-slate-200 p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-slate-100" />
              <div className="h-4 w-16 bg-slate-100 rounded" />
            </div>
            <div className="h-8 w-20 bg-slate-200 rounded" />
          </div>
        ))}
      </div>

      {/* Section Header */}
      <div className="h-6 w-40 bg-slate-200 rounded" />

      {/* Action Cards */}
      {[1, 2].map((i) => (
        <div key={i} className="bg-white rounded-2xl border border-slate-200 p-6">
          <div className="flex items-start gap-4">
            <div className="w-5 h-5 bg-slate-200 rounded mt-1" />
            <div className="flex-1 space-y-4">
              <div className="flex gap-2">
                <div className="h-5 w-20 bg-slate-100 rounded" />
                <div className="h-5 w-16 bg-slate-100 rounded" />
              </div>
              <div className="h-7 w-64 bg-slate-200 rounded" />
              <div className="h-4 w-48 bg-slate-100 rounded" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
