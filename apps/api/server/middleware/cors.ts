export default defineEventHandler((event) => {
  if (!getRequestURL(event).pathname.startsWith('/api/'))
    return

  appendResponseHeader(event, 'Vary', 'Origin')
  const origin = getHeader(event, 'origin')
  if (!origin)
    return

  const allowedOrigins = useRuntimeConfig(event).allowedOrigins.split(',').map(value => value.trim())
  if (!allowedOrigins.includes(origin)) {
    throw createError({ statusCode: 403, statusMessage: 'Origin is not allowed.' })
  }

  setResponseHeader(event, 'Access-Control-Allow-Origin', origin)
  if (event.method === 'OPTIONS') {
    const method = getHeader(event, 'access-control-request-method')
    const headers = getHeader(event, 'access-control-request-headers')?.split(',').map(value => value.trim().toLowerCase()) || []
    if (!method || !['GET', 'POST'].includes(method) || headers.some(header => header !== 'content-type')) {
      throw createError({ statusCode: 403, statusMessage: 'CORS request is not allowed.' })
    }
    setResponseHeader(event, 'Access-Control-Allow-Methods', 'GET, POST')
    setResponseHeader(event, 'Access-Control-Allow-Headers', 'Content-Type')
    return sendNoContent(event)
  }
})
