import { describe, it, expect } from 'vitest'
import { renderHook } from '@testing-library/react'
import { usePushNotifications } from '../src/pwa/usePushNotifications.js'

describe('usePushNotifications', () => {
  it('reporta "no-soportado" en un entorno sin Push API (jsdom no la implementa)', () => {
    const { result } = renderHook(() => usePushNotifications())

    expect(result.current.soportado).toBe(false)
    expect(result.current.permiso).toBe('no-soportado')
    expect(result.current.suscrito).toBeNull()
  })
})
