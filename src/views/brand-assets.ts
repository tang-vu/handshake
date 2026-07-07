// Brand mark, inlined as strings so it ships inside the Docker image
// (the assets/ directory is not copied into the runtime image). Served at
// /favicon.svg and /logo.svg, and referenced by the trace viewer.

export const faviconSvg = `<svg width="512" height="512" viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="bg" x1="0" y1="0" x2="512" y2="512" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#6366F1"/><stop offset="0.55" stop-color="#4F46E5"/><stop offset="1" stop-color="#06B6D4"/></linearGradient></defs><rect width="512" height="512" rx="96" fill="url(#bg)"/><g stroke="#FFFFFF" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M 150 108 L 92 108 L 92 404 L 150 404" stroke-width="56"/><path d="M 362 108 L 420 108 L 420 404 L 362 404" stroke-width="56"/><path d="M 178 262 L 228 320 L 330 190" stroke-width="60"/></g></svg>`;

export const logoSvg = `<svg width="512" height="512" viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="bg" x1="0" y1="0" x2="512" y2="512" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#6366F1"/><stop offset="0.55" stop-color="#4F46E5"/><stop offset="1" stop-color="#06B6D4"/></linearGradient></defs><rect width="512" height="512" rx="116" fill="url(#bg)"/><g stroke="#FFFFFF" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M 170 148 L 120 148 L 120 364 L 170 364" stroke-width="46"/><path d="M 342 148 L 392 148 L 392 364 L 342 364" stroke-width="46"/><path d="M 198 260 L 238 306 L 316 206" stroke-width="50"/></g></svg>`;

// Small inline data-URI form for embedding directly in <link rel="icon">.
export const faviconDataUri = `data:image/svg+xml;base64,${Buffer.from(faviconSvg).toString('base64')}`;
