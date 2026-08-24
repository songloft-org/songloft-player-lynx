import '../../../shims/router-env.js'
import '@testing-library/jest-dom'
import { expect, test, vi } from 'vitest'
import { fireEvent, getQueriesForElement, render } from '@lynx-js/react/testing-library'

vi.mock('react-i18next', async () =>
  (await import('../../../__tests__/_render-mocks.js')).mockReactI18next(),
)

/**
 * The shell no longer knows *where* back goes — it delegates to the one route-back
 * policy the hardware back key also uses (`shared/nav/route-back.ts`, applied by
 * `performRouteBack`). Which target each route resolves to is pinned by
 * `shared/nav/__tests__/route-back.test.ts`, over every leaf route; what is left to
 * assert here is only that the arrow reaches that policy at all.
 */
const routeBackSpy = vi.fn()
vi.mock('../../../core/navigation/route-back-action.js', () => ({
  performRouteBack: () => routeBackSpy(),
}))

const { SubPageShell, SubPageEmbedContext } = await import('../widgets/SubPageShell.js')

test('renders the title and children', () => {
  render(
    <SubPageShell title='Lyrics'>
      <text>body</text>
    </SubPageShell>,
  )
  const { queryByText } = getQueriesForElement(elementTree.root!)

  expect(queryByText('Lyrics')).toBeInTheDocument()
  expect(queryByText('body')).toBeInTheDocument()
})

test('the back affordance delegates to the shared route-back policy', () => {
  routeBackSpy.mockClear()
  render(
    <SubPageShell title='Lyrics' backTestId='lyrics-back'>
      <text>body</text>
    </SubPageShell>,
  )
  const { getByTestId } = getQueriesForElement(elementTree.root!)

  fireEvent.tap(getByTestId('lyrics-back'))
  expect(routeBackSpy).toHaveBeenCalled()
})

test('onBack takes over from the router', () => {
  routeBackSpy.mockClear()
  const onBack = vi.fn()
  render(
    <SubPageShell title='Licenses' onBack={onBack} backTestId='licenses-back'>
      <text>body</text>
    </SubPageShell>,
  )
  const { getByTestId } = getQueriesForElement(elementTree.root!)

  fireEvent.tap(getByTestId('licenses-back'))
  expect(onBack).toHaveBeenCalled()
  expect(routeBackSpy).not.toHaveBeenCalled()
})

/**
 * The reason this shell exists. In the wide-screen right pane the settings list is
 * still on screen and the router is already at `/settings`, so a "back to
 * /settings" arrow does nothing at all — it was a dead key on all 15 sub-pages.
 */
test('no back affordance inside the settings detail pane', () => {
  render(
    <SubPageEmbedContext.Provider value={true}>
      <SubPageShell title='Lyrics' backTestId='lyrics-back'>
        <text>body</text>
      </SubPageShell>
    </SubPageEmbedContext.Provider>,
  )
  const { queryByTestId, queryByText } = getQueriesForElement(elementTree.root!)

  expect(queryByTestId('lyrics-back')).not.toBeInTheDocument()
  // The page itself still renders — only the arrow is gone.
  expect(queryByText('Lyrics')).toBeInTheDocument()
  expect(queryByText('body')).toBeInTheDocument()
})

/**
 * An explicit `onBack` is an in-pane sibling swap (About → Licenses), which stays
 * meaningful inside the pane. Only the implicit route-back arrow is the dead one,
 * so the embed context must not hide this variant.
 */
test('an explicit onBack survives inside the detail pane', () => {
  const onBack = vi.fn()
  render(
    <SubPageEmbedContext.Provider value={true}>
      <SubPageShell title='Licenses' onBack={onBack} backTestId='licenses-back'>
        <text>body</text>
      </SubPageShell>
    </SubPageEmbedContext.Provider>,
  )
  const { getByTestId } = getQueriesForElement(elementTree.root!)

  fireEvent.tap(getByTestId('licenses-back'))
  expect(onBack).toHaveBeenCalled()
})

test('scrollable=false hands scrolling to the page', () => {
  const { container } = render(
    <SubPageShell title='Plugin store' scrollable={false}>
      <text>sliders</text>
    </SubPageShell>,
  )

  // The gesture-owning page (the registry's `<list>`) must not be
  // nested in a scroll-view or its own scrolling stops working.
  expect(container.querySelectorAll('scroll-view')).toHaveLength(0)
})

test('actions render in the topbar', () => {
  render(
    <SubPageShell title='Plugins' actions={<text>refresh</text>}>
      <text>body</text>
    </SubPageShell>,
  )
  const { queryByText } = getQueriesForElement(elementTree.root!)

  expect(queryByText('refresh')).toBeInTheDocument()
})
