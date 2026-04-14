import { ipcMain, BrowserWindow } from 'electron';
import axios from 'axios';
import WebSocket from 'ws';

const BACKEND_URL = 'http://127.0.0.1:8000';
const WS_URL = 'ws://127.0.0.1:8000/ws';

let ws: WebSocket | null = null;
let mainWindow: BrowserWindow | null = null;

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
  ws = new WebSocket(WS_URL);
  
  ws.on('open', () => {
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
    console.log('WebSocket closed, reconnecting in 5s...');
    setTimeout(connectWebSocket, 5000);
  });
  
  ws.on('error', (err) => {
    console.error('WebSocket error:', err);
  });
}

// Image generation
ipcMain.handle('generation:generate-image', async (_event, params) => {
  try {
    const response = await requestBackend(() => axios.post(`${BACKEND_URL}/api/generate/image`, params));
    return {
      success: true,
      jobId: response.data.job_id,
    };
  } catch (error: any) {
    console.error('Image generation error:', error);
    return {
      success: false,
      error: error.response?.data?.detail || error.message
    };
  }
});

// Video generation
ipcMain.handle('generation:generate-video', async (_event, params) => {
  try {
    const response = await requestBackend(() => axios.post(`${BACKEND_URL}/api/generate/video`, params));
    return {
      success: true,
      jobId: response.data.job_id,
    };
  } catch (error: any) {
    console.error('Video generation error:', error);
    return {
      success: false,
      error: error.response?.data?.detail || error.message
    };
  }
});

ipcMain.handle('generation:enhance-prompt', async (_event, params) => {
  try {
    const response = await requestBackend(() => axios.post(`${BACKEND_URL}/api/prompts/enhance`, params));
    return response.data;
  } catch (error: any) {
    return {
      success: false,
      error: error.response?.data?.detail || error.message,
    };
  }
});

ipcMain.handle('generation:crop-image', async (_event, params) => {
  try {
    const response = await requestBackend(() => axios.post(`${BACKEND_URL}/api/images/crop`, params));
    return response.data;
  } catch (error: any) {
    const detail = error.response?.data?.detail ?? error.response?.data ?? error.message ?? String(error);
    return {
      success: false,
      error: typeof detail === 'string' ? detail : JSON.stringify(detail),
    };
  }
});

ipcMain.handle('generation:upscale-image', async (_event, params) => {
  try {
    const response = await requestBackend(() => axios.post(`${BACKEND_URL}/api/images/upscale`, params));
    return response.data;
  } catch (error: any) {
    const detail = error.response?.data?.detail ?? error.response?.data ?? error.message ?? String(error);
    return {
      success: false,
      error: typeof detail === 'string' ? detail : JSON.stringify(detail),
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
      }));
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
      error: error.response?.data?.detail || error.message
    };
  }
});

// Get job status
ipcMain.handle('generation:get-status', async (_event, jobId: string) => {
  try {
    const response = await requestBackend(() => axios.get(`${BACKEND_URL}/api/jobs/${jobId}`));
    return response.data;
  } catch (error: any) {
    console.error('Get status error:', error);
    return {
      success: false,
      error: error.response?.data?.detail || error.message
    };
  }
});

// Cancel job
ipcMain.handle('generation:cancel', async (_event, jobId: string) => {
  try {
    const response = await requestBackend(() => axios.post(`${BACKEND_URL}/api/jobs/${jobId}/cancel`));
    return response.data;
  } catch (error: any) {
    console.error('Cancel job error:', error);
    return {
      success: false,
      error: error.response?.data?.detail || error.message
    };
  }
});

// List jobs
ipcMain.handle('generation:list-jobs', async (_event, options = {}) => {
  try {
    const { status, limit = 50 } = options;
    let url = `${BACKEND_URL}/api/jobs?limit=${limit}`;
    if (status) url += `&status=${status}`;
    
    const response = await requestBackend(() => axios.get(url));
    return response.data;
  } catch (error: any) {
    console.error('List jobs error:', error);
    return {
      success: false,
      error: error.response?.data?.detail || error.message
    };
  }
});

// Note: 'system:get-info' is registered in electron/main.ts with richer backend-liveness handling.

// List models
ipcMain.handle('models:list', async () => {
  try {
    const response = await requestBackend(() => axios.get(`${BACKEND_URL}/api/models`));
    return response.data;
  } catch (error: any) {
    console.error('List models error:', error);
    return [];
  }
});

// Download model
ipcMain.handle('models:download', async (_event, modelId: string) => {
  try {
    const response = await requestBackend(() => axios.post(`${BACKEND_URL}/api/models/${modelId}/download`));
    return response.data;
  } catch (error: any) {
    console.error('Download model error:', error);
    return {
      success: false,
      error: error.response?.data?.detail || error.message
    };
  }
});

// Get model status
ipcMain.handle('models:get-status', async (_event, modelId: string) => {
  try {
    const response = await requestBackend(() => axios.get(`${BACKEND_URL}/api/models/${modelId}/status`));
    return response.data;
  } catch (error: any) {
    console.error('Get model status error:', error);
    return null;
  }
});

ipcMain.handle('models:delete', async (_event, modelId: string) => {
  try {
    const response = await requestBackend(() => axios.delete(`${BACKEND_URL}/api/models/${modelId}`));
    return response.data;
  } catch (error: any) {
    return {
      success: false,
      error: error.response?.data?.detail || error.message,
    };
  }
});
