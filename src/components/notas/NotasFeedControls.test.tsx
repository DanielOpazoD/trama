import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createRef } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { NotasFeedControls } from './NotasFeedControls'

describe('<NotasFeedControls />', () => {
  it('orquesta tabs, búsqueda y triage de capturas mediante callbacks', async () => {
    const user = userEvent.setup()
    const onSegmentChange = vi.fn()
    const onOpenSearch = vi.fn()
    const onCapturaStatusChange = vi.fn()

    render(
      <NotasFeedControls
        accent="var(--accent-sage)"
        segment="capturas"
        search=""
        searchOpen={false}
        searchInputRef={createRef<HTMLInputElement>()}
        activeTag={null}
        tagCounts={[]}
        calendarOpen={false}
        calendarDays={[]}
        calendarStats={[]}
        selectedDay={null}
        capturaStatus="pending"
        recorteThumb="mediana"
        feedView="list"
        itemCount={3}
        galleryMode={false}
        selectionMode={false}
        onSegmentChange={onSegmentChange}
        onOpenSearch={onOpenSearch}
        onCloseSearch={vi.fn()}
        onSearchChange={vi.fn()}
        onActiveTagChange={vi.fn()}
        onToggleCalendar={vi.fn()}
        onSelectDay={vi.fn()}
        onCapturaStatusChange={onCapturaStatusChange}
        onRecorteThumbChange={vi.fn()}
        onFeedViewChange={vi.fn()}
        onToggleSelection={vi.fn()}
      />,
    )

    await user.click(screen.getByRole('tab', { name: 'Todo' }))
    expect(onSegmentChange).toHaveBeenCalledWith('todo')

    await user.click(screen.getByRole('button', { name: 'Buscar en notas y capturas' }))
    expect(onOpenSearch).toHaveBeenCalledTimes(1)

    await user.click(screen.getByRole('tab', { name: 'Archivadas' }))
    expect(onCapturaStatusChange).toHaveBeenCalledWith('archived')
  })
})
