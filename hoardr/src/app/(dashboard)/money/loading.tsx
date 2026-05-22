export default function Loading() {
  return (
    <div className="min-h-screen bg-bg-base tab-enter">

      {/* Header */}
      <div className="px-5 pt-12 flex justify-end">
        <div className="skeleton w-10 h-10 rounded-full" />
      </div>

      {/* Summary tiles */}
      <div className="mx-4 mt-4 flex gap-2">
        {[1, 2, 3].map(i => (
          <div key={i} className="flex-1 bg-bg-surface border border-white/[0.06] rounded-[22px] p-3">
            <div className="skeleton h-2 w-10 mb-2" />
            <div className="skeleton h-6 w-16" />
          </div>
        ))}
      </div>

      {/* Filter pills */}
      <div className="flex gap-2 mx-4 mt-4">
        {[80, 72, 60].map(w => (
          <div key={w} className="skeleton h-8 rounded-full" style={{ width: w }} />
        ))}
      </div>

      {/* Transaction rows */}
      <div className="mx-4 mt-5 space-y-2.5">
        <div className="skeleton h-2 w-16 mb-3" />
        {[1, 2, 3, 4, 5].map(i => (
          <div key={i} className="flex items-center gap-3 px-4 py-3.5 bg-bg-surface border border-white/[0.06] rounded-[18px]">
            <div className="skeleton w-10 h-10 rounded-[12px] flex-shrink-0" />
            <div className="flex-1 space-y-1.5">
              <div className="skeleton h-3.5 w-28" />
              <div className="skeleton h-2.5 w-16" />
            </div>
            <div className="skeleton h-4 w-14 flex-shrink-0" />
          </div>
        ))}
      </div>

      <div className="h-24" />
    </div>
  )
}
