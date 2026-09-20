export default function NotFound() {
  return (
    <div className="flex h-screen items-center justify-center">
      <div className="flex max-w-sm flex-col items-center gap-3 text-center">
        <h2 className="text-lg font-semibold text-gray-900">页面不存在</h2>
        <p className="text-sm text-gray-500">请返回首页继续使用。</p>
        <a className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white" href="/">
          返回首页
        </a>
      </div>
    </div>
  );
}
