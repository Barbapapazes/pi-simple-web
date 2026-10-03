export function truncateTitle(title: string): string {
  const characters = Array.from(title)
  return characters.length > 100 ? `${characters.slice(0, 100).join('')}…` : title
}
