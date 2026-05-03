'use client';
// Minimal shadcn-style useToast hook
import * as React from 'react';
import type { ToastProps } from './toast';

type ToasterToast = ToastProps & {
  id: string;
  title?: React.ReactNode;
  description?: React.ReactNode;
};

const TOAST_LIMIT = 3;
const TOAST_REMOVE_DELAY = 4000;

type State = { toasts: ToasterToast[] };

let memoryState: State = { toasts: [] };
const listeners: Array<(state: State) => void> = [];

function dispatch(state: State) {
  memoryState = state;
  listeners.forEach((l) => l(state));
}

function addToast(toast: Omit<ToasterToast, 'id'>) {
  const id = Math.random().toString(36).slice(2);
  const next: ToasterToast = { id, ...toast };
  dispatch({ toasts: [next, ...memoryState.toasts].slice(0, TOAST_LIMIT) });
  setTimeout(() => {
    dispatch({ toasts: memoryState.toasts.filter((t) => t.id !== id) });
  }, TOAST_REMOVE_DELAY);
  return id;
}

export function toast(props: Omit<ToasterToast, 'id'>) {
  return addToast(props);
}

export function useToast() {
  const [state, setState] = React.useState(memoryState);
  React.useEffect(() => {
    listeners.push(setState);
    return () => {
      const idx = listeners.indexOf(setState);
      if (idx > -1) listeners.splice(idx, 1);
    };
  }, []);
  return { ...state, toast, dismiss: (id: string) => dispatch({ toasts: state.toasts.filter((t) => t.id !== id) }) };
}
