"use client";

export default function Error({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex h-screen items-center justify-center">
      <div className="flex max-w-sm flex-col items-center gap-3 text-center">
        <h2 className="text-lg font-semibold text-gray-900">页面加载失败</h2>
        <p className="text-sm text-gray-500">请稍后重试，或刷新页面。</p>
        <button
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white"
          onClick={reset}
          type="button"
        >
          重试
        </button>
      </div>
    </div>
  );
}
