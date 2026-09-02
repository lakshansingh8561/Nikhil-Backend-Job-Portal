/**
 * Lightweight HTML Content Sanitizer for Blog Rich Text.
 * Strips script tags, event handlers (e.g. onload, onclick), and javascript: links.
 */
export const sanitizeHtml = (html: string): string => {
  if (!html) return "";

  return html
    // Remove <script> ... </script>
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    // Remove <iframe ... > (unless safe embedded video source)
    .replace(/<iframe\b[^>]*>(.*?<\/iframe>)?/gi, (match) => {
      if (match.includes("youtube.com") || match.includes("vimeo.com")) {
        return match;
      }
      return "";
    })
    // Remove inline event handlers (on*="...")
    .replace(/\s+on[a-z]+\s*=\s*(?:'[^']*'|"[^"]*"|[^\s>]+)/gi, "")
    // Remove javascript: pseudo-protocol URIs
    .replace(/href\s*=\s*(?:'javascript:[^']*'|"javascript:[^"]*")/gi, 'href="#"');
};
