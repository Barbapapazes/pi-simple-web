// Transcript content is untrusted: enable Markdown, not HTML, MDC components,
// bindings, or arbitrary attributes. Keep frontmatter visible as message text.
export const transcriptMarkdownOptions = {
  registerDefaultPlugins: false,
  headingIds: false,
}
