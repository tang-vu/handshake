// Shared HTML text escaper for the server-rendered views. Values interpolated
// into markup (job ids, agent ids, timestamps) come from SQLite and the CAP
// negotiation payload, so they are never trusted as markup.

export const esc = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
