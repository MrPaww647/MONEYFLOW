const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('moneyflow', {
  listTransactions: () => ipcRenderer.invoke('transactions:list'),
  addTransaction: tx => ipcRenderer.invoke('transactions:add', tx),
  deleteTransaction: id => ipcRenderer.invoke('transactions:delete', id),
  importCsv: () => ipcRenderer.invoke('transactions:import'),
  listBudgets: () => ipcRenderer.invoke('budgets:list'),
  saveBudget: item => ipcRenderer.invoke('budgets:save', item),
  listGoals: () => ipcRenderer.invoke('goals:list'),
  addGoal: goal => ipcRenderer.invoke('goals:add', goal),
  deleteGoal: id => ipcRenderer.invoke('goals:delete', id),
  exportCsv: () => ipcRenderer.invoke('data:export'),
  detectRecurring: () => ipcRenderer.invoke('recurring:detect'),
  createBackup: () => ipcRenderer.invoke('backup:create'),
  restoreBackup: () => ipcRenderer.invoke('backup:restore'),
  listBankProviders: () => ipcRenderer.invoke('banks:providers'),
  getYearAnalytics: year => ipcRenderer.invoke('analytics:year', year)
});