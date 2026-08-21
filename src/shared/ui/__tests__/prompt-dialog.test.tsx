import '@testing-library/jest-dom'
import { expect, test, vi } from 'vitest'
import { fireEvent, getQueriesForElement, render } from '@lynx-js/react/testing-library'

/**
 * `PromptDialog` — the single-field dialog behind "new playlist".
 *
 * The lynx-ui `Input` is stood in with a tappable stub that fires `onInput`:
 * the shared `mockLynxUiInput` only renders the placeholder, and what matters
 * here is the guard on the submit button, which needs a value to change.
 */

vi.mock('react-i18next', async () =>
  (await import('../../../__tests__/_render-mocks.js')).mockReactI18next(),
)
vi.mock('@lynx-js/lynx-ui-dialog', async () =>
  (await import('../../../__tests__/_render-mocks.js')).mockLynxUiDialog(),
)
vi.mock('@lynx-js/lynx-ui-input', () => ({
  Input: ({ placeholder, onInput }: { placeholder?: string; onInput?: (v: string) => void }) => (
    // Padded on purpose: the dialog must hand back a trimmed name.
    <view data-testid='stub-input' bindtap={() => onInput?.('  Road Trip  ')}>
      <text>{placeholder}</text>
    </view>
  ),
}))

const { PromptDialog } = await import('../PromptDialog.js')

function renderDialog() {
  const onConfirm = vi.fn()
  const onCancel = vi.fn()
  render(
    <PromptDialog
      show
      title='New playlist'
      label='Playlist name'
      confirmLabel='Create'
      onConfirm={onConfirm}
      onCancel={onCancel}
      testId='prompt'
      confirmTestId='prompt-confirm'
      cancelTestId='prompt-cancel'
    />,
  )
  return { onConfirm, onCancel, ...getQueriesForElement(elementTree.root!) }
}

test('renders the title and the field label', () => {
  const { queryByText } = renderDialog()
  expect(queryByText('New playlist')).toBeInTheDocument()
  expect(queryByText('Playlist name')).toBeInTheDocument()
})

test('an empty name marks the submit button unavailable and does nothing', () => {
  const { onConfirm, getByTestId } = renderDialog()
  expect(getByTestId('prompt-confirm').className).toContain('confirm-dialog__btn--disabled')
  fireEvent.tap(getByTestId('prompt-confirm'), {})
  expect(onConfirm).not.toHaveBeenCalled()
})

test('a typed name enables submit and is reported trimmed', () => {
  const { onConfirm, getByTestId } = renderDialog()
  fireEvent.tap(getByTestId('stub-input'), {})
  expect(getByTestId('prompt-confirm').className).not.toContain('confirm-dialog__btn--disabled')

  fireEvent.tap(getByTestId('prompt-confirm'), {})
  expect(onConfirm).toHaveBeenCalledWith('Road Trip')
})

test('cancel reports without a value', () => {
  const { onCancel, onConfirm, getByTestId } = renderDialog()
  fireEvent.tap(getByTestId('prompt-cancel'), {})
  expect(onCancel).toHaveBeenCalled()
  expect(onConfirm).not.toHaveBeenCalled()
})
