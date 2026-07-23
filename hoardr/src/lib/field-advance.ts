// Auto-advance helper for bottom-sheet forms.
//
// Completing a field (Enter on an input, or picking a category/card/date)
// calls this to scroll the *next* field to the top of the sheet's scroll area
// and, when useful, focus its input — so the user never has to hand-scroll
// down to reach Category / Card / Date / the Add button.
//
// Uses scrollTo on the container rather than el.scrollIntoView(), which
// misbehaves inside iOS WKWebView fixed sheets (see CLAUDE.md).

const GAP = 12 // px of breathing room above the advanced-to field

export function advanceToField(
  scrollArea: HTMLElement | null,
  section: HTMLElement | null,
  focusEl?: HTMLElement | null,
) {
  if (scrollArea && section) {
    const delta = section.getBoundingClientRect().top - scrollArea.getBoundingClientRect().top
    scrollArea.scrollTo({ top: scrollArea.scrollTop + delta - GAP, behavior: 'smooth' })
  }
  if (focusEl) requestAnimationFrame(() => focusEl.focus())
}
