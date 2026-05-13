export default function Loading() {
  return (
    <div className="min-h-screen bg-bg-base tab-enter">
      <div className="px-5 pt-14 pb-0">
        <div className="skeleton h-2.5 w-16 mb-2.5" />
        <div className="skeleton h-8 w-24" />
      </div>

      {/* Renewal strip */}
      <div className="mx-4 mt-5 bg-bg-surface border border-white/[0.06] rounded-card p-5">
        <div className="skeleton h-2.5 w-28 mb-4" />
        <div className="flex gap-2 overflow-hidden">
          {Array.from({ length: 10 }).map((_, i) => (
            <div key={i} className="skeleton flex-shrink-0 w-10 h-14 rounded-[12px]" />
          ))}
        </div>
      </div>

      {/* Toggle pills */}
      <div className="flex gap-2 px-4 mt-4">
        <div className="skeleton h-8 w-28 rounded-full" />
        <div className="skeleton h-8 w-24 rounded-full" />
      </div>

      {/* List rows */}
      <div className="mx-4 mt-5">
        <div className="bg-bg-surface border border-white/[0.06] rounded-card overflow-hidden divide-y divide-white/[0.04]">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="flex items-center gap-3 px-4 py-3.5">
              <div className="skeleton w-10 h-10 rounded-[12px] flex-shrink-0" />
              <div className="flex-1 space-y-1.5">
                <div className="skeleton h-3.5 w-32" />
                <div className="skeleton h-2.5 w-20" />
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
