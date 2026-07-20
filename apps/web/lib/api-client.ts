import { hc } from 'hono/client';
import type videoRoutes from '../../api/src/routes/video';

// API base URL - in production this would be an environment variable
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3100';

export const apiClient = hc<typeof videoRoutes>(API_BASE_URL);
