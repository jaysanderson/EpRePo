import { TenantPicker } from '../pages/TenantPicker.tsx'

/** The apex is CorpusKit's permanent front door, even with a single portal. */
export function RootRedirect() {
  return <TenantPicker />
}
