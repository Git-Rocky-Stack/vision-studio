import { ipcMain, BrowserWindow } from 'electron';
import axios from 'axios';
import WebSocket from 'ws';

const BACKEND_URL = 'http://localhost:8000';
const WS_URL = 'ws://localhost:8000/ws';

let ws: WebSocket | null = null;
let mainWindow: BrowserWindow | null = null;

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
    const response = await axios.post(`${BACKEND_URL}/api/generate/image`, params);
    return response.data;
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
    const response = await axios.post(`${BACKEND_URL}/api/generate/video`, params);
    return response.data;
  } catch (error: any) {
    console.error('Video generation error:', error);
    return {
      success: false,
      error: error.response?.data?.detail || error.message
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
      const response = await axios.post(`${BACKEND_URL}/api/generate/image`, {
        ...baseParams,
        prompt
      });
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
    const response = await axios.get(`${BACKEND_URL}/api/jobs/${jobId}`);
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
    const response = await axios.post(`${BACKEND_URL}/api/jobs/${jobId}/cancel`);
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
    
    const response = await axios.get(url);
    return response.data;
  } catch (error: any) {
    console.error('List jobs error:', error);
    return {
      success: false,
      error: error.response?.data?.detail || error.message
    };
  }
});

// Get system info
ipcMain.handle('system:get-info', async () => {
  try {
    const response = await axios.get(`${BACKEND_URL}/api/system/info`);
    return response.data;
  } catch (error: any) {
    console.error('Get system info error:', error);
    return {
      gpu_available: false,
      comfyui_connected: false,
      models_count: 0
    };
  }
});

// List models
ipcMain.handle('models:list', async () => {
  try {
    const response = await axios.get(`${BACKEND_URL}/api/models`);
    return response.data;
  } catch (error: any) {
    console.error('List models error:', error);
    return [];
  }
});

// Download model
ipcMain.handle('models:download', async (_event, modelId: string) => {
  try {
    const response = await axios.post(`${BACKEND_URL}/api/models/${modelId}/download`);
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
    const response = await axios.get(`${BACKEND_URL}/api/models/${modelId}/status`);
    return response.data;
  } catch (error: any) {
    console.error('Get model status error:', error);
    return null;
  }
});
