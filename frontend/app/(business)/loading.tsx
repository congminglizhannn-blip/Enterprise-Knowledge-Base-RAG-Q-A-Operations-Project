export default function BusinessLoading() {
  return <div role="status" aria-live="polite" className="flex flex-1 flex-col gap-4 p-6" aria-label="正在加载页面">
    <span className="text-sm text-gray-500">正在加载页面...</span>
    <div className="h-10 animate-pulse rounded bg-blue-50" />
    <div className="h-48 animate-pulse rounded bg-blue-50" />
  </div>;
}
