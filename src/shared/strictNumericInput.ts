/** Reject whole edits rather than silently changing pasted financial values. */
export function strictNumericInput(pattern: RegExp, currentValue: () => string) {
  return {
    beforeinput(event: Event) {
      const inputEvent = event as InputEvent
      if (!inputEvent.data || !inputEvent.inputType.startsWith('insert')) return
      const input = event.target as HTMLInputElement
      const start = input.selectionStart ?? input.value.length
      const end = input.selectionEnd ?? start
      const next = input.value.slice(0, start) + inputEvent.data + input.value.slice(end)
      if (!pattern.test(next)) event.preventDefault()
    },
    // Capture runs before UInput updates its model, including paste, drop and IME input.
    input(event: Event) {
      const input = event.target as HTMLInputElement
      if (!pattern.test(input.value)) input.value = currentValue()
    },
  }
}
