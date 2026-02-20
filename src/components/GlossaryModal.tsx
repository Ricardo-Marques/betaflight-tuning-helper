import { useRef } from 'react'
import { observer } from 'mobx-react-lite'
import styled from '@emotion/styled'
import { useUIStore } from '../stores/RootStore'
import { useAutorun, useObservableState } from '../lib/mobx-reactivity'
import { Tooltip } from './Tooltip'
import {
  GLOSSARY_ENTRIES,
  GLOSSARY_CATEGORIES,
  GLOSSARY_CATEGORY_LABELS,
} from '../data/glossary'
import type { GlossaryEntry } from '../data/glossary'

const Backdrop = styled.div`
  position: fixed;
  inset: 0;
  z-index: 200;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: rgba(0, 0, 0, 0.4);
`

const ModalContainer = styled.div`
  position: relative;
  z-index: 201;
  max-width: 36rem;
  width: 90vw;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  background-color: ${p => p.theme.colors.background.panel};
  border: 1px solid ${p => p.theme.colors.border.main};
  border-radius: 0.75rem;
  box-shadow: 0 25px 50px -12px rgb(0 0 0 / 0.25);
`

const ModalHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.25rem;
  border-bottom: 1px solid ${p => p.theme.colors.border.subtle};
`

const ModalTitle = styled.h2`
  font-size: 1.125rem;
  font-weight: 700;
  color: ${p => p.theme.colors.text.heading};
  margin: 0;
`

const CloseButton = styled.button`
  background: none;
  border: none;
  padding: 0.25rem;
  cursor: pointer;
  color: ${p => p.theme.colors.text.muted};
  font-size: 1.25rem;
  line-height: 1;

  &:hover {
    color: ${p => p.theme.colors.text.primary};
  }

  @media (pointer: coarse) {
    padding: 0.5rem;
    min-width: 2.75rem;
    min-height: 2.75rem;
    display: flex;
    align-items: center;
    justify-content: center;
  }
`

const SearchWrapper = styled.div`
  padding: 0.75rem 1.25rem 0;
`

const SearchInput = styled.input`
  width: 100%;
  padding: 0.5rem 0.75rem;
  font-size: 0.8125rem;
  border: 1px solid ${p => p.theme.colors.border.main};
  border-radius: 0.375rem;
  background-color: ${p => p.theme.colors.background.section};
  color: ${p => p.theme.colors.text.primary};
  box-sizing: border-box;

  &::placeholder {
    color: ${p => p.theme.colors.text.muted};
  }

  &:focus {
    outline: none;
    border-color: ${p => p.theme.colors.border.focus};
  }
`

const ModalBody = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 0.75rem 1.25rem 1rem;
`

const CategorySection = styled.div`
  margin-bottom: 1rem;

  &:last-child {
    margin-bottom: 0;
  }
`

const CategoryHeading = styled.h3`
  font-size: 0.6875rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: ${p => p.theme.colors.text.muted};
  margin: 0 0 0.5rem;
  padding-bottom: 0.25rem;
  border-bottom: 1px solid ${p => p.theme.colors.border.subtle};
`

const EntryRow = styled.div<{ isTarget: boolean }>`
  padding: 0.5rem 0.625rem;
  border-radius: 0.375rem;
  transition: background-color 0.3s;

  ${p => p.isTarget && `
    background-color: ${p.theme.colors.accent.indigoBg};
  `}

  & + & {
    margin-top: 0.25rem;
  }
`

const TermName = styled.span`
  font-weight: 700;
  font-size: 0.875rem;
  color: ${p => p.theme.colors.text.heading};
`

const Explanation = styled.p`
  font-size: 0.8125rem;
  color: ${p => p.theme.colors.text.primary};
  margin: 0.125rem 0 0;
  line-height: 1.4;
`

const Detail = styled.p`
  font-size: 0.75rem;
  color: ${p => p.theme.colors.text.secondary};
  margin: 0.25rem 0 0;
  line-height: 1.4;
`

const EmptyMessage = styled.p`
  color: ${p => p.theme.colors.text.muted};
  font-size: 0.875rem;
  text-align: center;
  padding: 2rem 0;
`

function groupByCategory(entries: GlossaryEntry[]): Map<string, GlossaryEntry[]> {
  const groups = new Map<string, GlossaryEntry[]>()
  for (const entry of entries) {
    const existing = groups.get(entry.category)
    if (existing) {
      existing.push(entry)
    } else {
      groups.set(entry.category, [entry])
    }
  }
  return groups
}

export const GlossaryModal = observer(() => {
  const uiStore = useUIStore()
  const bodyRef = useRef<HTMLDivElement>(null)
  const [filter, setFilter] = useObservableState('')

  // Scroll to target term when the modal opens with a specific term
  useAutorun(() => {
    const termId = uiStore.glossaryTargetTerm
    if (!termId || !uiStore.glossaryOpen) return
    // Clear the filter so the target term is visible
    setFilter('')
    requestAnimationFrame(() => {
      const el = bodyRef.current?.querySelector(`[data-term-id="${termId}"]`)
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
    })
  })

  if (!uiStore.glossaryOpen) return null

  const handleBackdropClick = (e: React.MouseEvent): void => {
    if (e.target === e.currentTarget) uiStore.closeGlossary()
  }

  const handleKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Escape') uiStore.closeGlossary()
  }

  const lowerFilter = filter.toLowerCase()
  const filtered = lowerFilter
    ? GLOSSARY_ENTRIES.filter(e =>
        e.term.toLowerCase().includes(lowerFilter) ||
        e.explanation.toLowerCase().includes(lowerFilter)
      )
    : GLOSSARY_ENTRIES

  const grouped = groupByCategory(filtered)

  return (
    <Backdrop onClick={handleBackdropClick} onKeyDown={handleKeyDown}>
      <ModalContainer>
        <ModalHeader>
          <ModalTitle>Glossary</ModalTitle>
          <Tooltip text="Close">
            <CloseButton onClick={uiStore.closeGlossary} aria-label="Close">&times;</CloseButton>
          </Tooltip>
        </ModalHeader>
        <SearchWrapper>
          <SearchInput
            type="text"
            placeholder="Search terms..."
            value={filter}
            onChange={e => setFilter(e.target.value)}
            autoFocus
          />
        </SearchWrapper>
        <ModalBody ref={bodyRef}>
          {filtered.length === 0 ? (
            <EmptyMessage>No matching terms found.</EmptyMessage>
          ) : (
            GLOSSARY_CATEGORIES.map(cat => {
              const entries = grouped.get(cat)
              if (!entries || entries.length === 0) return null
              return (
                <CategorySection key={cat}>
                  <CategoryHeading>{GLOSSARY_CATEGORY_LABELS[cat]}</CategoryHeading>
                  {entries.map(entry => (
                    <EntryRow
                      key={entry.id}
                      data-term-id={entry.id}
                      isTarget={uiStore.glossaryTargetTerm === entry.id}
                    >
                      <TermName>{entry.term}</TermName>
                      <Explanation>{entry.explanation}</Explanation>
                      {entry.detail && <Detail>{entry.detail}</Detail>}
                    </EntryRow>
                  ))}
                </CategorySection>
              )
            })
          )}
        </ModalBody>
      </ModalContainer>
    </Backdrop>
  )
})
