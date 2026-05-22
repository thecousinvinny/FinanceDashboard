export default function SettingsLoading() {
  return (
    <div className="min-h-screen bg-bg-base pb-28">
      {/* Header */}
      <div className="px-5 pt-14 pb-6">
        <div className="skeleton w-12 h-3 mb-2 rounded" />
        <div className="skeleton w-36 h-8 rounded" />
      </div>

      {/* Accounts */}
      <div className="px-5 mb-6">
        <div className="skeleton w-16 h-2.5 mb-3 rounded" />
        <div className="bg-bg-surface border border-white/[0.06] rounded-card p-4">
          <div className="flex items-center gap-3">
            <div className="skeleton w-8 h-8 rounded-[10px]" />
            <div className="flex-1 space-y-1.5">
              <div className="skeleton w-28 h-3.5 rounded" />
              <div className="skeleton w-36 h-3 rounded" />
            </div>
          </div>
        </div>
      </div>

      {/* Appearance */}
      <div className="px-5 mb-6">
        <div className="skeleton w-20 h-2.5 mb-3 rounded" />
        <div className="grid grid-cols-3 gap-2.5">
          {[0, 1, 2].map(i => (
            <div key={i} className="skeleton rounded-[14px] h-24" />
          ))}
        </div>
      </div>

      {/* App */}
      <div className="px-5">
        <div className="skeleton w-8 h-2.5 mb-3 rounded" />
        <div className="bg-bg-surface border border-white/[0.06] rounded-card p-4 space-y-4">
          <div className="flex items-center gap-3">
            <div className="skeleton w-8 h-8 rounded-full" />
            <div className="skeleton w-48 h-3 rounded" />
          </div>
          <div className="flex items-center gap-3 pt-3.5 border-t border-white/[0.04]">
            <div className="skeleton w-8 h-8 rounded-[10px]" />
            <div className="skeleton w-16 h-3.5 rounded" />
          </div>
        </div>
      </div>
    </div>
  )
}
