// Conversation content is untrusted: enable Markdown, not HTML, MDC components,
// bindings, or arbitrary attributes. Keep frontmatter visible as message text.
export const conversationMarkdownOptions = {
  registerDefaultPlugins: false,
  headingIds: false,
}
