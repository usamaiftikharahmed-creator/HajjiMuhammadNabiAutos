/**
 * Format any uploaded file or image URL to be fully accessible
 * in both Vite dev mode (localhost:5173) and Express production (localhost:5000).
 */
export const getFileUrl = (url) => {
  if (!url) return '';
  if (
    url.startsWith('data:') ||
    url.startsWith('blob:') ||
    url.startsWith('http://') ||
    url.startsWith('https://')
  ) {
    return url;
  }

  const clean = url.startsWith('/') ? url : `/${url}`;

  // If in Vite dev environment (port 5173), direct uploads to backend port 5000
  if (typeof window !== 'undefined') {
    const { hostname, port } = window.location;
    if (port === '5173') {
      return `http://localhost:5000${clean}`;
    }
    // On localhost, 127.0.0.1, or LAN network:
    if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname.startsWith('192.168.') || hostname.startsWith('10.')) {
      return clean;
    }
    // In production on Vercel:
    if (hostname.includes('vercel.app')) {
      return clean;
    }
  }

  return clean;
};

/**
 * Generate 1-2 letter initials for customer name fallback
 */
export const getCustomerInitials = (name) => {
  if (!name || typeof name !== 'string') return 'C';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
};
