export default function Loading() {
  return (
    <div className="min-h-screen bg-bg-base tab-enter">
      <div className="px-5 pt-14 pb-0">
        <div className="skeleton h-2.5 w-16 mb-2.5" />
        <div className="skeleton h-8 w-28" />
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3 mx-4 mt-5">
        {[1, 2, 3].map(i => (
          <div key={i} className="bg-bg-surface border border-white/[0.06] rounded-card p-4 space-y-1.5">
            <div className="skeleton h-2.5 w-12" />
            <div className="skeleton h-5 w-16" />
          </div>
        ))}
      </div>

      {/* Status filter */}
      <div className="flex gap-2 px-4 mt-4 overflow-hidden">
        {[1, 2, 3, 4, 5].map(i => (
          <div key={i} className="skeleton flex-shrink-0 h-8 w-20 rounded-full" />
        ))}
      </div>

      {/* Commission rows */}
      <div className="mx-4 mt-5">
        <div className="bg-bg-surface border border-white/[0.06] rounded-card overflow-hidden divide-y divide-white/[0.04]">
          {[1, 2, 3].map(i => (
            <div key={i} className="px-4 py-4 space-y-2">
              <div className="flex items-center justify-between">
                <div className="skeleton h-3.5 w-36" />
                <div className="skeleton h-5 w-20 rounded-full" />
              </div>
              <div className="flex items-center gap-3">
                <div className="skeleton h-2.5 w-24" />
                <div className="skeleton h-2.5 w-16" />
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="h-24" />
    </div>
  )
}
