import { expect } from '@std/expect'
import { workerSecrets } from './upload-secrets.ts'

Deno.test('Worker secret upload excludes account provisioning credentials', () => {
  const values = workerSecrets(`
ARAG_ZONE=aws-ap-southeast-2-1
ARAG_ACCOUNT=must-not-upload
ARAG_NUA_KEY=must-not-upload
ARAG_KB_FRDC=box-id
ARAG_KB_FRDC_TOKEN="box-token"
ENTRA_CLIENT_SECRET=client-secret
SESSION_SECRET=session-secret
`)

  expect(values).toEqual({
    ARAG_ZONE: 'aws-ap-southeast-2-1',
    ARAG_KB_FRDC: 'box-id',
    ARAG_KB_FRDC_TOKEN: 'box-token',
    ENTRA_CLIENT_SECRET: 'client-secret',
    SESSION_SECRET: 'session-secret',
  })
})
