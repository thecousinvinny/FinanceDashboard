export default function Loading() {
  return (
    <div className="min-h-screen bg-bg-base tab-enter">
      <div className="px-5 pt-14 pb-0">
        <div className="skeleton h-2.5 w-16 mb-2.5" />
        <div className="skeleton h-8 w-32" />
      </div>

      {/* Month nav */}
      <div className="flex items-center justify-between px-5 mt-5">
        <div className="skeleton h-8 w-8 rounded-full" />
        <div className="skeleton h-5 w-24" />
        <div className="skeleton h-8 w-8 rounded-full" />
      </div>

      {/* Day-of-week headers */}
      <div className="grid grid-cols-7 gap-1 px-4 mt-4">
        {['S','M','T','W','T','F','S'].map((d, i) => (
          <div key={i} className="skeleton h-3 mx-1 rounded" />
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7 gap-1 px-4 mt-2">
        {Array.from({ length: 35 }).map((_, i) => (
          <div key={i} className="skeleton aspect-square rounded-[10px]" />
        ))}
      </div>

      <div className="h-24" />
    </div>
  )
}
