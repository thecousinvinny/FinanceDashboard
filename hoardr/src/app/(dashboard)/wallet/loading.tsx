export default function Loading() {
  return (
    <div className="min-h-screen bg-bg-base tab-enter">
      <div className="px-5 pt-14 pb-0">
        <div className="skeleton h-2.5 w-16 mb-2.5" />
        <div className="skeleton h-8 w-24" />
      </div>

      {/* Card visual */}
      <div className="px-4 mt-5">
        <div className="skeleton h-48 w-full rounded-[20px]" />
      </div>

      {/* Toggle pills */}
      <div className="flex gap-2 px-4 mt-4">
        <div className="skeleton h-8 w-20 rounded-full" />
        <div className="skeleton h-8 w-20 rounded-full" />
      </div>

      {/* Card / bank rows */}
      <div className="mx-4 mt-4">
        <div className="bg-bg-surface border border-white/[0.06] rounded-card overflow-hidden divide-y divide-white/[0.04]">
          {[1, 2, 3].map(i => (
            <div key={i} className="flex items-center gap-3 px-4 py-3.5">
              <div className="skeleton w-10 h-10 rounded-[12px] flex-shrink-0" />
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
