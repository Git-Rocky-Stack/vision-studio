import { ipcMain, BrowserWindow } from 'electron';
import axios from 'axios';
import WebSocket from 'ws';
import { getBackendAuthToken, backendAuthHeaders } from '../services/backendAuth';
import { toSafeRendererError } from '../services/security';

const BACKEND_URL = 'http://127.0.0.1:8000';
const WS_URL = 'ws://127.0.0.1:8000/ws';

let ws: WebSocket | null = null;
let mainWindow: BrowserWindow | null = null;
let wsReconnectAttempts = 0;
const WS_BASE_DELAY = 1000; // 1s initial delay, doubles each attempt up to 30s

function isConnectionRefused(error: any) {
  return typeof error?.message === 'string' && error.message.includes('ECONNREFUSED');
}

function isBackendDownError(error: any) {
  const msg = typeof error?.message === 'string' ? error.message : '';
  return msg.includes('ECONNREFUSED') || error?.code === 'ECONNREFUSED';
}

const BACKEND_DOWN_MESSAGE =
  'The AI backend is not running. Please restart the app or start the backend manually from Settings.';

async function requestBackend<T>(request: () => Promise<T>, attempts: number = 3, delayMs: number = 1000): Promise<T> {
  let lastError: any;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await request();
    } catch (error: any) {
      lastError = error;
      // If the backend is clearly down, don't waste time retrying
      if (isBackendDownError(error)) {
        const friendly = new Error(BACKEND_DOWN_MESSAGE);
        (friendly as any).code = 'BACKEND_DOWN';
        throw friendly;
      }
      if (attempt === attempts) {
        throw error;
      }

      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  throw lastError;
}

export function setupGenerationHandlers(window: BrowserWindow) {
  mainWindow = window;
  connectWebSocket();
}

function connectWebSocket() {
  ws = new WebSocket(`${WS_URL}?token=${encodeURIComponent(getBackendAuthToken())}`);
  
  ws.on('open', () => {
    wsReconnectAttempts = 0;
    console.log('Connected to Python backend WebSocket');
  });
  
  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data.toString());
      
      if (message.type === 'job_update') {
        // Forward to renderer
        mainWindow?.webContents.send('generation:progress', message);
      }
    } catch (e) {
      console.error('Failed to parse WebSocket message:', e);
    }
  });
  
  ws.on('close', () => {
    const delay = Math.min(WS_BASE_DELAY * Math.pow(2, wsReconnectAttempts), 30000);
    wsReconnectAttempts++;
    console.log(`WebSocket closed, reconnecting in ${delay}ms (attempt ${wsReconnectAttempts})...`);
    setTimeout(connectWebSocket, delay);
  });
  
  ws.on('error', (err) => {
    console.error('WebSocket error:', err);
  });
}

// Image generation
ipcMain.handle('generation:generate-image', async (_event, params) => {
  try {
    const response = await requestBackend(() => axios.post(`${BACKEND_URL}/api/generate/image`, params, { headers: backendAuthHeaders() }));
    return {
      success: true,
      jobId: response.data.job_id,
    };
  } catch (error: any) {
    console.error('Image generation error:', error);
    return {
      success: false,
      error: toSafeRendererError(error, 'Image generation failed')
    };
  }
});

// Video generation
ipcMain.handle('generation:generate-video', async (_event, params) => {
  try {
    const response = await requestBackend(() => axios.post(`${BACKEND_URL}/api/generate/video`, params, { headers: backendAuthHeaders() }));
    return {
      success: true,
      jobId: response.data.job_id,
    };
  } catch (error: any) {
    console.error('Video generation error:', error);
    return {
      success: false,
      error: toSafeRendererError(error, 'Video generation failed')
    };
  }
});

ipcMain.handle('generation:enhance-prompt', async (_event, params) => {
  try {
    const response = await requestBackend(() => axios.post(`${BACKEND_URL}/api/prompts/enhance`, params, { headers: backendAuthHeaders() }));
    return response.data;
  } catch (error: any) {
    return {
      success: false,
      error: toSafeRendererError(error, 'Prompt enhancement failed'),
    };
  }
});

ipcMain.handle('generation:crop-image', async (_event, params) => {
  try {
    const response = await requestBackend(() => axios.post(`${BACKEND_URL}/api/images/crop`, params, { headers: backendAuthHeaders() }));
    return response.data;
  } catch (error: any) {
    return {
      success: false,
      error: toSafeRendererError(error, 'Image crop failed'),
    };
  }
});

ipcMain.handle('generation:upscale-image', async (_event, params) => {
  try {
    const response = await requestBackend(() => axios.post(`${BACKEND_URL}/api/images/upscale`, params, { headers: backendAuthHeaders() }));
    return response.data;
  } catch (error: any) {
    return {
      success: false,
      error: toSafeRendererError(error, 'Image upscale failed'),
    };
  }
});

ipcMain.handle('generation:extract-video-frame', async (_event, params) => {
  try {
    const response = await requestBackend(() =>
      axios.post(`${BACKEND_URL}/api/videos/extract-frame`, params, { headers: backendAuthHeaders() })
    );
    return response.data;
  } catch (error: any) {
    return {
      success: false,
      error: toSafeRendererError(error, 'Video frame extraction failed'),
    };
  }
});

// Batch generation
ipcMain.handle('generation:batch', async (_event, params) => {
  try {
    const { prompts, ...baseParams } = params;
    const jobIds: string[] = [];
    
    // Queue all prompts
    for (const prompt of prompts) {
      const response = await requestBackend(() => axios.post(`${BACKEND_URL}/api/generate/image`, {
        ...baseParams,
        prompt
      }, { headers: backendAuthHeaders() }));
      jobIds.push(response.data.job_id);
    }
    
    return {
      success: true,
      jobIds
    };
  } catch (error: any) {
    console.error('Batch generation error:', error);
    return {
      success: false,
      error: toSafeRendererError(error, 'Batch generation failed')
    };
  }
});

// Get job status
ipcMain.handle('generation:get-status', async (_event, jobId: string) => {
  try {
    const response = await requestBackend(() => axios.get(`${BACKEND_URL}/api/jobs/${jobId}`, { headers: backendAuthHeaders() }));
    return response.data;
  } catch (error: any) {
    console.error('Get status error:', error);
    return {
      success: false,
      error: toSafeRendererError(error, 'Could not get generation status')
    };
  }
});

// Cancel job
ipcMain.handle('generation:cancel', async (_event, jobId: string) => {
  try {
    const response = await requestBackend(() => axios.post(`${BACKEND_URL}/api/jobs/${jobId}/cancel`, undefined, { headers: backendAuthHeaders() }));
    return response.data;
  } catch (error: any) {
    console.error('Cancel job error:', error);
    return {
      success: false,
      error: toSafeRendererError(error, 'Could not cancel generation')
    };
  }
});

// List jobs
ipcMain.handle('generation:list-jobs', async (_event, options = {}) => {
  try {
    const { status, limit = 50 } = options;
    let url = `${BACKEND_URL}/api/jobs?limit=${limit}`;
    if (status) url += `&status=${status}`;
    
    const response = await requestBackend(() => axios.get(url, { headers: backendAuthHeaders() }));
    return response.data;
  } catch (error: any) {
    console.error('List jobs error:', error);
    return {
      success: false,
      error: toSafeRendererError(error, 'Could not list jobs')
    };
  }
});

// Note: 'system:get-info' is registered in electron/main.ts with richer backend-liveness handling.

// List models
ipcMain.handle('models:list', async () => {
  try {
    const response = await requestBackend(() => axios.get(`${BACKEND_URL}/api/models`, { headers: backendAuthHeaders() }));
    return response.data;
  } catch (error: any) {
    console.error('List models error:', error);
    return [];
  }
});

// Download model
ipcMain.handle('models:download', async (_event, modelId: string) => {
  try {
    const response = await requestBackend(() => axios.post(`${BACKEND_URL}/api/models/${modelId}/download`, undefined, { headers: backendAuthHeaders() }));
    return response.data;
  } catch (error: any) {
    console.error('Download model error:', error);
    return {
      success: false,
      error: toSafeRendererError(error, 'Model download failed')
    };
  }
});

// Get model status
ipcMain.handle('models:get-status', async (_event, modelId: string) => {
  try {
    const response = await requestBackend(() => axios.get(`${BACKEND_URL}/api/models/${modelId}/status`, { headers: backendAuthHeaders() }));
    return response.data;
  } catch (error: any) {
    console.error('Get model status error:', error);
    return null;
  }
});

ipcMain.handle('models:delete', async (_event, modelId: string) => {
  try {
    const response = await requestBackend(() => axios.delete(`${BACKEND_URL}/api/models/${modelId}`, { headers: backendAuthHeaders() }));
    return response.data;
  } catch (error: any) {
    console.error('Delete model error:', error);
    return {
      success: false,
      error: toSafeRendererError(error, 'Model delete failed'),
    };
  }
});
