export default function Loading() {
  return (
    <div className="min-h-screen bg-bg-base tab-enter">
      <div className="px-5 pt-14 pb-0">
        <div className="skeleton h-2.5 w-24 mb-2.5" />
        <div className="skeleton h-8 w-36" />
      </div>

      <div className="mx-4 mt-5 bg-bg-surface border border-white/[0.06] rounded-card p-5">
        <div className="flex items-start justify-between mb-3">
          <div className="skeleton h-2.5 w-20" />
          <div className="skeleton h-5 w-24 rounded-full" />
        </div>
        <div className="skeleton h-14 w-52 mb-5" />
        <div className="skeleton h-16 w-full mb-4 rounded-lg" />
        <div className="flex border-t border-white/[0.06] pt-4 gap-2">
          {[1, 2, 3].map(i => (
            <div key={i} className="flex-1 space-y-1.5">
              <div className="skeleton h-2 w-10" />
              <div className="skeleton h-4 w-16" />
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 mx-4 mt-3">
        {[1, 2].map(i => (
          <div key={i} className="bg-bg-surface border border-white/[0.06] rounded-card p-4 flex flex-col gap-3">
            <div className="skeleton w-8 h-8 rounded-[10px]" />
            <div className="space-y-1.5">
              <div className="skeleton h-5 w-20" />
              <div className="skeleton h-2.5 w-24" />
            </div>
          </div>
        ))}
      </div>

      <div className="mx-4 mt-6">
        <div className="skeleton h-2 w-16 mb-3" />
        <div className="space-y-2.5">
          {[1, 2, 3].map(i => (
            <div key={i} className="flex items-center gap-3 px-4 py-3.5 bg-bg-surface border border-white/[0.06] rounded-[18px]">
              <div className="skeleton w-10 h-10 rounded-full flex-shrink-0" />
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
