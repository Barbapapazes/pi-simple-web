export default defineEventHandler((event) => {
  // Preserve the conversation endpoint's same-origin protection before
  // replacing Origin for the server-to-server request.
  const origin = getHeader(event, 'origin')
  if (origin && origin !== getRequestURL(event).origin) {
    throw createError({ statusCode: 403, statusMessage: 'Cross-origin API requests are not allowed.' })
  }
  const base = useRuntimeConfig(event).apiBase.replace(/\/$/, '')
  // Append the incoming path, never resolve it as a URL (which could change host).
  const target = new URL(base + event.path)
  return proxyRequest(event, target.href, {
    headers: { origin: target.origin },
  })
})
