export default function Loading() {
  return (
    <div className="min-h-screen bg-bg-base tab-enter">
      <div className="px-5 pt-14 pb-0">
        <div className="skeleton h-2.5 w-16 mb-2.5" />
        <div className="skeleton h-8 w-28" />
      </div>

      {/* Bar chart hero */}
      <div className="mx-4 mt-5 bg-bg-surface border border-white/[0.06] rounded-card p-5">
        <div className="skeleton h-2.5 w-24 mb-4" />
        <div className="flex items-end gap-1 h-24 mb-3">
          {Array.from({ length: 30 }).map((_, i) => (
            <div
              key={i}
              className="skeleton flex-1 rounded-[3px]"
              style={{ height: `${30 + Math.sin(i * 0.8) * 20 + Math.random() * 20}%` }}
            />
          ))}
        </div>
        <div className="flex gap-2 pt-3 border-t border-white/[0.06]">
          {[1, 2, 3].map(i => (
            <div key={i} className="flex-1 space-y-1.5">
              <div className="skeleton h-2 w-10" />
              <div className="skeleton h-4 w-16" />
            </div>
          ))}
        </div>
      </div>

      {/* Filter pills */}
      <div className="flex gap-2 px-4 mt-4">
        {[1, 2, 3].map(i => (
          <div key={i} className="skeleton h-8 w-20 rounded-full" />
        ))}
      </div>

      {/* Transaction rows */}
      <div className="mx-4 mt-5">
        <div className="skeleton h-2 w-16 mb-3" />
        <div className="bg-bg-surface border border-white/[0.06] rounded-card overflow-hidden divide-y divide-white/[0.04]">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="flex items-center gap-3 px-4 py-3.5">
              <div className="skeleton w-10 h-10 rounded-full flex-shrink-0" />
              <div className="flex-1 space-y-1.5">
                <div className="skeleton h-3.5 w-28" />
                <div className="skeleton h-2.5 w-16" />
              </div>
              <div className="skeleton h-4 w-14 flex-shrink-0" />
            </div>
          ))}
        </div>
      </div>

      <div className="h-24" />
    </div>
  )
}
