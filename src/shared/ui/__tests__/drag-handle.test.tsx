import '@testing-library/jest-dom'
import { act, getQueriesForElement, render } from '@lynx-js/react/testing-library'
import { expect, test, vi } from 'vitest'

const { isWeb } = vi.hoisted(() => ({ isWeb: vi.fn(() => false) }))
vi.mock('../../../native/web-platform.js', () => ({ isWebPlatform: isWeb }))

import { DragHandle } from '../DragHandle.js'

test.each([
  { web: false, disabled: false },
  { web: true, disabled: false },
  { web: false, disabled: true },
  { web: true, disabled: true },
])('gesture ownership on web=$web, disabled=$disabled', async ({ web, disabled }) => {
  isWeb.mockReturnValue(web)
  render(
    <view data-testid='row'>
      <DragHandle className='test-handle' testId='handle' disabled={disabled}>
        <text>Grip</text>
      </DragHandle>
      <text>Scrollable row content</text>
    </view>,
  )
  await act(async () => {
    await Promise.resolve()
  })
  const queries = getQueriesForElement(elementTree.root!)
  const handle = queries.getByTestId('handle')
  expect(handle).toHaveClass('test-handle')
  expect(handle).toHaveTextContent('Grip')
  if (disabled) expect(handle).not.toHaveAttribute('consume-slide-event')
  else expect(handle).toHaveAttribute('consume-slide-event', '[[-180,180]]')
  expect(handle.style.touchAction ?? '').toBe(web && !disabled ? 'none' : '')
  expect(queries.getByTestId('row')).not.toHaveAttribute('consume-slide-event')
  expect(queries.getByTestId('row').style.touchAction ?? '').toBe('')
})
