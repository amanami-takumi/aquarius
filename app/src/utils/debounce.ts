export function debounce<T extends (...args: Parameters<T>) => ReturnType<T>>(
  fn: T,
  delay: number
) {
  let timer: number | null = null
  return (...args: Parameters<T>) => {
    if (timer) {
      clearTimeout(timer)
    }
    timer = window.setTimeout(() => {
      fn(...args)
    }, delay)
  }
}
