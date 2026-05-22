export default function CategoriesLoading() {
  return (
    <div className="min-h-screen bg-bg-base pb-28">
      <div className="px-5 pt-14 pb-6 flex items-center gap-3">
        <div className="skeleton w-8 h-8 rounded-full" />
        <div className="space-y-1">
          <div className="skeleton w-16 h-2.5 rounded" />
          <div className="skeleton w-28 h-6 rounded" />
        </div>
      </div>
      <div className="px-5 space-y-2">
        {[...Array(8)].map((_, i) => <div key={i} className="skeleton h-14 rounded-[14px]" />)}
      </div>
    </div>
  )
}
