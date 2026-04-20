'use client'

import type { ProjectId } from '@/lib/constants'

interface Props {
  value: ProjectId
  onChange: (project: ProjectId) => void
  disabled?: boolean
}

export function ProjectSelector({ value, onChange, disabled }: Props) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as ProjectId)}
      disabled={disabled}
      className="border rounded pl-3 pr-8 py-1.5 text-sm bg-white appearance-none bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2216%22%20height%3D%2216%22%20viewBox%3D%220%200%2024%2024%22%20fill%3D%22none%22%20stroke%3D%22%23666%22%20stroke-width%3D%222%22%3E%3Cpath%20d%3D%22M6%209l6%206%206-6%22%2F%3E%3C%2Fsvg%3E')] bg-[length:16px] bg-[right_8px_center] bg-no-repeat disabled:opacity-50 disabled:cursor-not-allowed"
    >
      <option value="hotelin">Hotelin.com</option>
      <option value="gdeotel">Gdeotel.ru</option>
    </select>
  )
}
