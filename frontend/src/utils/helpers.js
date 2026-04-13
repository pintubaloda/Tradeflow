export const formatCurrency = (amount, currency = 'INR') => {
  const num = parseFloat(amount) || 0;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency', currency,
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(num);
};

export const formatDate = (date) => {
  if (!date) return '—';
  return new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(date));
};

export const today = () => new Date().toISOString().split('T')[0];

export const classNames = (...classes) => classes.filter(Boolean).join(' ');

export const getInitials = (name = '') =>
  name.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase();

export const txnTypeLabel = (type) => ({
  advance: 'Advance', debit: 'Debit', credit: 'Received', mnp: 'MNP',
}[type] || type);

export const txnTypeColor = (type) => ({
  advance: 'blue', debit: 'red', credit: 'green', mnp: 'amber',
}[type] || 'gray');

export const paymentModeLabel = (mode) => ({
  cash: 'Cash', upi: 'UPI', cheque: 'Cheque', bank: 'Bank Transfer',
}[mode] || mode);

export const debounce = (fn, ms = 300) => {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
};
