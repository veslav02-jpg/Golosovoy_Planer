import { create } from 'zustand';

// UI-состояние: активная вкладка дока и открытая шторка/модалка
export const useUI = create((set) => ({
  tab: 'today', // today | plans | growth | more
  modal: null,  // {type:'task'|'quick'|'finish'|'planday'|'search'|'habit', payload}
  setTab: (tab) => set({ tab }),
  openModal: (modal) => set({ modal }),
  closeModal: () => set({ modal: null }),
  openTask: (id) => set({ modal: { type: 'task', payload: id } }),
  openTaskNew: (preset = {}) => set({ modal: { type: 'task', payload: { _new: true, ...preset } } }),
}));
