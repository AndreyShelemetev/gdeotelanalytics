'use client'

interface Props {
  label?: string
  fullScreen?: boolean
}

export function LoadingSpinner({ label, fullScreen }: Props) {
  const content = (
    <div className="flex flex-col items-center gap-3">
      <div className="w-10 h-10 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
      {label && <p className="text-sm text-gray-500">{label}</p>}
    </div>
  )

  if (fullScreen) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        {content}
      </div>
    )
  }

  return <div className="flex justify-center py-16">{content}</div>
}
