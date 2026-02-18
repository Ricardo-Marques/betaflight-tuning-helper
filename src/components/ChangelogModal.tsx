import { observer } from 'mobx-react-lite'
import styled from '@emotion/styled'
import { useUIStore } from '../stores/RootStore'
import { useComputed } from '../lib/mobx-reactivity'
import { markBuildAsSeen } from '../lib/changelog/lastSeenBuild'
import changelogData from 'virtual:changelog'
import type { ChangelogCategory, ChangelogEntry } from '../domain/types/Changelog'

const Backdrop = styled.div`
  position: fixed;
  inset: 0;
  z-index: 200;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(2px);
`

const ModalContainer = styled.div`
  position: relative;
  z-index: 201;
  max-width: 32rem;
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
`

const ModalBody = styled.div`
  flex: 1;
  overflow-y: auto;
  padding: 1rem 1.25rem;
`

const EmptyMessage = styled.p`
  color: ${p => p.theme.colors.text.muted};
  font-size: 0.875rem;
  text-align: center;
  padding: 2rem 0;
`

const DateGroup = styled.div`
  margin-bottom: 1.25rem;

  &:last-child {
    margin-bottom: 0;
  }
`

const DateHeading = styled.h3`
  font-size: 0.75rem;
  font-weight: 600;
  color: ${p => p.theme.colors.text.muted};
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin: 0 0 0.5rem;
`

const EntryItem = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  padding: 0.375rem 0;
`

const categoryColors: Record<ChangelogCategory, { bg: string; text: string }> = {
  feature: { bg: 'accent.greenBg', text: 'accent.greenText' },
  fix: { bg: 'severity.mediumBg', text: 'severity.mediumText' },
  improvement: { bg: 'accent.indigoBg', text: 'accent.indigoText' },
}

interface BadgeProps {
  category: ChangelogCategory
}

const CategoryBadge = styled.span<BadgeProps>`
  flex-shrink: 0;
  font-size: 0.625rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  padding: 0.125rem 0.375rem;
  border-radius: 0.25rem;
  line-height: 1.4;
  margin-top: 0.125rem;
  background-color: ${p => {
    const key = categoryColors[p.category].bg
    const [group, prop] = key.split('.') as [string, string]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (p.theme.colors as any)[group]?.[prop]
  }};
  color: ${p => {
    const key = categoryColors[p.category].text
    const [group, prop] = key.split('.') as [string, string]
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (p.theme.colors as any)[group]?.[prop]
  }};
`

const EntryMessage = styled.span`
  font-size: 0.8125rem;
  color: ${p => p.theme.colors.text.primary};
  line-height: 1.4;
`

const ModalFooter = styled.div`
  padding: 0.75rem 1.25rem;
  border-top: 1px solid ${p => p.theme.colors.border.subtle};
  font-size: 0.6875rem;
  color: ${p => p.theme.colors.text.muted};
  text-align: center;
`

function formatDate(iso: string): string {
  const [year, month, day] = iso.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
}

function groupByDate(entries: ChangelogEntry[]): Array<[string, ChangelogEntry[]]> {
  const groups = new Map<string, ChangelogEntry[]>()
  for (const entry of entries) {
    const existing = groups.get(entry.date)
    if (existing) {
      existing.push(entry)
    } else {
      groups.set(entry.date, [entry])
    }
  }
  return Array.from(groups.entries())
}

export const ChangelogModal = observer(() => {
  const uiStore = useUIStore()

  const grouped = useComputed(() => groupByDate(changelogData.entries))

  if (!uiStore.changelogOpen) return null

  // Mark as seen whenever the modal is rendered
  markBuildAsSeen(changelogData.buildHash)

  const handleBackdropClick = (e: React.MouseEvent): void => {
    if (e.target === e.currentTarget) uiStore.closeChangelog()
  }

  const handleKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === 'Escape') uiStore.closeChangelog()
  }

  return (
    <Backdrop onClick={handleBackdropClick} onKeyDown={handleKeyDown}>
      <ModalContainer>
        <ModalHeader>
          <ModalTitle>What&apos;s New</ModalTitle>
          <CloseButton onClick={uiStore.closeChangelog} title="Close">&times;</CloseButton>
        </ModalHeader>
        <ModalBody>
          {grouped.length === 0 ? (
            <EmptyMessage>No changelog entries available.</EmptyMessage>
          ) : (
            grouped.map(([date, entries]) => (
              <DateGroup key={date}>
                <DateHeading>{formatDate(date)}</DateHeading>
                {entries.map(entry => (
                  <EntryItem key={entry.hash}>
                    <CategoryBadge category={entry.category}>{entry.category}</CategoryBadge>
                    <EntryMessage>{entry.message}</EntryMessage>
                  </EntryItem>
                ))}
              </DateGroup>
            ))
          )}
        </ModalBody>
        <ModalFooter>
          Build {changelogData.buildHash} &middot; {formatDate(changelogData.buildDate)}
        </ModalFooter>
      </ModalContainer>
    </Backdrop>
  )
})
