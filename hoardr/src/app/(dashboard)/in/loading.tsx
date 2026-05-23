export default function Loading() {
  return (
    <div className="min-h-screen bg-bg-base tab-enter">
      <div className="flex gap-2 px-4 pt-14">
        <div className="skeleton h-8 w-20 rounded-full" />
        <div className="skeleton h-8 w-20 rounded-full" />
        <div className="skeleton h-8 w-20 rounded-full" />
      </div>
      <div className="px-4 mt-5 space-y-4">
        <div className="skeleton h-48 w-full rounded-[20px]" />
        <div className="skeleton h-48 w-full rounded-[20px]" />
      </div>
      <div className="h-24" />
    </div>
  )
}
