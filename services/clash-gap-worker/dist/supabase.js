import { createClient } from '@supabase/supabase-js';
import WebSocket from 'ws';
import { config } from './config.js';
let client = null;
export function sb() {
    if (!client) {
        client = createClient(config.supabaseUrl, config.supabaseServiceKey, {
            auth: { persistSession: false, autoRefreshToken: false },
            // Node.js 20 lacks native WebSocket; Supabase Realtime requires a transport.
            realtime: { transport: WebSocket },
        });
    }
    return client;
}
