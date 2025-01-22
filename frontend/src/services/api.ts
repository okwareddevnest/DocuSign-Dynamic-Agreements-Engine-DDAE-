import axios from 'axios';
import { io, Socket } from 'socket.io-client';

const API_URL = process.env.VITE_API_URL || 'http://localhost:3000';

// Create axios instance
const api = axios.create({
  baseURL: `${API_URL}/api/v1`,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Socket.IO instance
let socket: Socket | null = null;

export const connectSocket = () => {
  if (!socket) {
    socket = io(API_URL, {
      transports: ['websocket'],
      autoConnect: true,
    });

    socket.on('connect', () => {
      console.log('Socket connected');
    });

    socket.on('disconnect', () => {
      console.log('Socket disconnected');
    });
  }
  return socket;
};

// Template API
export const templateApi = {
  create: async (data: {
    name: string;
    description?: string;
    docusignTemplateId: string;
    dynamicFields: Record<string, {
      type: 'price' | 'iot' | 'weather';
      source: string;
      path: string;
      threshold?: number;
      operator?: '>' | '<' | '==' | '>=' | '<=';
    }>;
  }) => {
    const response = await api.post('/templates', data);
    return response.data;
  },

  list: async () => {
    const response = await api.get('/templates');
    return response.data;
  },

  get: async (id: string) => {
    const response = await api.get(`/templates/${id}`);
    return response.data;
  },

  update: async (id: string, data: any) => {
    const response = await api.put(`/templates/${id}`, data);
    return response.data;
  },

  delete: async (id: string) => {
    await api.delete(`/templates/${id}`);
  },

  uploadFile: async (id: string, file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    const response = await api.post(`/templates/${id}/files`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },
};

// Agreement API
export const agreementApi = {
  create: async (data: {
    templateId: string;
    signers: Array<{
      email: string;
      name: string;
      role: string;
    }>;
    paymentAmount?: number;
  }) => {
    const response = await api.post('/agreements', data);
    return response.data;
  },

  list: async (filters?: { status?: string; templateId?: string }) => {
    const response = await api.get('/agreements', { params: filters });
    return response.data;
  },

  get: async (id: string) => {
    const response = await api.get(`/agreements/${id}`);
    return response.data;
  },

  send: async (id: string) => {
    const response = await api.post(`/agreements/${id}/send`);
    return response.data;
  },

  confirmPayment: async (id: string, paymentIntentId: string) => {
    const response = await api.post(`/agreements/${id}/confirm-payment`, {
      paymentIntentId,
    });
    return response.data;
  },

  void: async (id: string, reason: string) => {
    const response = await api.post(`/agreements/${id}/void`, { reason });
    return response.data;
  },
};

// Real-time updates
export const subscribeToAgreement = (agreementId: string, callback: (data: any) => void) => {
  const socket = connectSocket();
  socket.emit('subscribe', { agreementId });
  socket.on(`agreement:${agreementId}`, callback);

  return () => {
    socket.off(`agreement:${agreementId}`, callback);
    socket.emit('unsubscribe', { agreementId });
  };
};

// Payment handling
export const initializeStripe = async () => {
  const stripe = await import('@stripe/stripe-js');
  return stripe.loadStripe(process.env.VITE_STRIPE_PUBLIC_KEY!);
}; 