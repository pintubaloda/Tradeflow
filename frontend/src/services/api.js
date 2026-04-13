import axios from 'axios';

const RUNTIME_API_URL = (typeof window !== 'undefined' && window.__TRADEFLOW_CONFIG__ && window.__TRADEFLOW_CONFIG__.API_URL) || '';
const BASE = RUNTIME_API_URL || process.env.REACT_APP_API_URL || '/api';

const api = axios.create({ baseURL: BASE, timeout: 15000 });

// Attach access token
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

let isRefreshing = false;
let failQueue = [];

const processQueue = (error, token = null) => {
  failQueue.forEach((p) => (error ? p.reject(error) : p.resolve(token)));
  failQueue = [];
};

// Auto-refresh on 401
api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && !original._retry && original.url !== '/auth/refresh') {
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failQueue.push({ resolve, reject });
        })
          .then((token) => {
            original.headers.Authorization = `Bearer ${token}`;
            return api(original);
          })
          .catch((err) => Promise.reject(err));
      }
      original._retry = true;
      isRefreshing = true;
      const refreshToken = localStorage.getItem('refreshToken');
      if (!refreshToken) {
        isRefreshing = false;
        window.dispatchEvent(new Event('auth:logout'));
        return Promise.reject(error);
      }
      try {
        const { data } = await axios.post(`${BASE}/auth/refresh`, { refreshToken });
        localStorage.setItem('accessToken', data.accessToken);
        localStorage.setItem('refreshToken', data.refreshToken);
        api.defaults.headers.common.Authorization = `Bearer ${data.accessToken}`;
        processQueue(null, data.accessToken);
        original.headers.Authorization = `Bearer ${data.accessToken}`;
        return api(original);
      } catch (refreshError) {
        processQueue(refreshError, null);
        localStorage.clear();
        window.dispatchEvent(new Event('auth:logout'));
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }
    return Promise.reject(error);
  }
);

export default api;

// Typed API helpers
export const authAPI = {
  register: (d) => api.post('/auth/register', d),
  login: (d) => api.post('/auth/login', d),
  logout: (d) => api.post('/auth/logout', d),
  me: () => api.get('/auth/me'),
};

export const firmAPI = {
  list: () => api.get('/firms'),
  create: (d) => api.post('/firms', d),
  update: (id, d) => api.put(`/firms/${id}`, d),
  getUsers: (id) => api.get(`/firms/${id}/users`),
  addUser: (id, d) => api.post(`/firms/${id}/users`, d),
};

export const vendorAPI = {
  list: (firmId, p) => api.get(`/firms/${firmId}/vendors`, { params: p }),
  create: (firmId, d) => api.post(`/firms/${firmId}/vendors`, d),
  update: (firmId, id, d) => api.put(`/firms/${firmId}/vendors/${id}`, d),
  getLedger: (firmId, vendorId, p) => api.get(`/firms/${firmId}/vendors/${vendorId}/transactions`, { params: p }),
  addTxn: (firmId, vendorId, d) => api.post(`/firms/${firmId}/vendors/${vendorId}/transactions`, d),
  updateTxn: (firmId, vendorId, txnId, d) => api.put(`/firms/${firmId}/vendors/${vendorId}/transactions/${txnId}`, d),
  deleteTxn: (firmId, vendorId, txnId) => api.delete(`/firms/${firmId}/vendors/${vendorId}/transactions/${txnId}`),
};

export const collectionAPI = {
  listRetailers: (firmId, p) => api.get(`/firms/${firmId}/retailers`, { params: p }),
  createRetailer: (firmId, d) => api.post(`/firms/${firmId}/retailers`, d),
  updateRetailer: (firmId, id, d) => api.put(`/firms/${firmId}/retailers/${id}`, d),
  list: (firmId, p) => api.get(`/firms/${firmId}/collections`, { params: p }),
  add: (firmId, d) => api.post(`/firms/${firmId}/collections`, d),
  agents: (firmId, date) => api.get(`/firms/${firmId}/collection/agents`, { params: { date } }),
  outstanding: (firmId) => api.get(`/firms/${firmId}/collection/outstanding`),
};

export const subscriptionAPI = {
  plans: () => api.get('/subscriptions/plans'),
  my: () => api.get('/subscriptions/my'),
  subscribeModule: (moduleKey) => api.post('/subscriptions/module', { moduleKey }),
  upgradePlan: (planId) => api.post('/subscriptions/upgrade', { planId }),
};

export const userAPI = {
  list: () => api.get('/users'),
  create: (d) => api.post('/users', d),
  update: (id, d) => api.put(`/users/${id}`, d),
  changePassword: (id, d) => api.put(`/users/${id}/password`, d),
};

export const reportAPI = {
  summary: (firmId, p) => api.get(`/firms/${firmId}/reports/summary`, { params: p }),
  vendorTransactions: (firmId, p) => api.get(`/firms/${firmId}/reports/vendor-transactions`, { params: p }),
  collections: (firmId, p) => api.get(`/firms/${firmId}/reports/collections`, { params: p }),
  retailerLedger: (firmId, retailerId, p) => api.get(`/firms/${firmId}/reports/retailers/${retailerId}/ledger`, { params: p }),
};
