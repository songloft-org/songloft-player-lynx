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

/**
 * With a `validate`. `accept: false` refuses everything, which is what the
 * rejection paths need; `true` refuses nothing.
 */
function renderValidating(accept: boolean) {
  const onConfirm = vi.fn()
  render(
    <PromptDialog
      show
      title='Custom duration'
      label='1 - 999'
      confirmLabel='Confirm'
      inputType='number'
      validate={() => (accept ? undefined : 'Not a number')}
      onConfirm={onConfirm}
      onCancel={vi.fn()}
      confirmTestId='prompt-confirm'
      errorTestId='prompt-error'
    />,
  )
  return { onConfirm, ...getQueriesForElement(elementTree.root!) }
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

/*
 * `validate` exists for the sleep timer's custom minutes / song count, where a
 * value can be non-empty and still wrong. Two things matter: the submit is
 * *blocked* (not clamped, not swallowed), and the reason is shown — on submit
 * rather than per keystroke, since every prefix of "120" is out of range.
 */
test('a rejected value shows the reason and does not confirm', () => {
  const { onConfirm, getByTestId, queryByTestId } = renderValidating(false)
  expect(queryByTestId('prompt-error')).not.toBeInTheDocument()

  fireEvent.tap(getByTestId('stub-input'), {})
  // Nothing yet: the value has only been typed, not submitted.
  expect(queryByTestId('prompt-error')).not.toBeInTheDocument()

  fireEvent.tap(getByTestId('prompt-confirm'), {})
  expect(onConfirm).not.toHaveBeenCalled()
  expect(queryByTestId('prompt-error')).toHaveTextContent('Not a number')
})

test('editing the field clears a previous rejection', () => {
  const { getByTestId, queryByTestId } = renderValidating(false)
  fireEvent.tap(getByTestId('stub-input'), {})
  fireEvent.tap(getByTestId('prompt-confirm'), {})
  expect(queryByTestId('prompt-error')).toBeInTheDocument()

  // Typing again is the user fixing it; leaving the old complaint under the field
  // would read as "still wrong".
  fireEvent.tap(getByTestId('stub-input'), {})
  expect(queryByTestId('prompt-error')).not.toBeInTheDocument()
})

test('an accepted value still reaches onConfirm through validate', () => {
  const { onConfirm, getByTestId, queryByTestId } = renderValidating(true)
  fireEvent.tap(getByTestId('stub-input'), {})
  fireEvent.tap(getByTestId('prompt-confirm'), {})
  expect(onConfirm).toHaveBeenCalledWith('Road Trip')
  expect(queryByTestId('prompt-error')).not.toBeInTheDocument()
})
