import { Navigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { getTenants } from '../api/client.ts'
import { TenantPicker } from '../pages/TenantPicker.tsx'

/**
 * The root route. With a single portal there is nothing to choose, so the root
 * IS that portal; the picker only appears if the deployment ever serves more
 * than one.
 */
export function RootRedirect() {
  const { data: tenants, isLoading, isError } = useQuery({
    queryKey: ['tenants'],
    queryFn: getTenants,
  })

  if (isLoading) {
    return (
      <div className='flex min-h-screen items-center justify-center bg-app' role='status'>
        <div
          className='h-9 w-9 animate-spin rounded-full border-2 border-line'
          style={{ borderTopColor: 'var(--rp-ink)' }}
          aria-hidden='true'
        />
        <span className='sr-only'>Loading</span>
      </div>
    )
  }

  const only = !isError && tenants?.length === 1 ? tenants[0] : undefined
  if (only) return <Navigate to={`/t/${only.slug}`} replace />

  return <TenantPicker />
}
