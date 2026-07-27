import { useState, useEffect } from "react";

const TOAST_LIMIT = 20;
const TOAST_DURATION = 10000; // auto-dismiss after 10s — paused while hovered
const TOAST_REMOVE_DELAY = 2400; // unmount after the fade-out finishes

const actionTypes = {
  ADD_TOAST: "ADD_TOAST",
  UPDATE_TOAST: "UPDATE_TOAST",
  DISMISS_TOAST: "DISMISS_TOAST",
  REMOVE_TOAST: "REMOVE_TOAST",
};

let count = 0;

function genId() {
  count = (count + 1) % Number.MAX_VALUE;
  return count.toString();
}

const toastTimeouts = new Map();
const dismissTimers = new Map(); // id -> { timeout, expiresAt, remaining }

const addToRemoveQueue = (toastId) => {
  if (toastTimeouts.has(toastId)) {
    return;
  }

  const timeout = setTimeout(() => {
    toastTimeouts.delete(toastId);
    dispatch({
      type: actionTypes.REMOVE_TOAST,
      toastId,
    });
  }, TOAST_REMOVE_DELAY);

  toastTimeouts.set(toastId, timeout);
};

const _clearFromRemoveQueue = (toastId) => {
  const timeout = toastTimeouts.get(toastId);
  if (timeout) {
    clearTimeout(timeout);
    toastTimeouts.delete(toastId);
  }
};

// Pausable auto-dismiss timer. Paused on hover (pauseToast) and resumed on
// mouse-leave (resumeToast) so reading a notification doesn't get cut off.
function startDismissTimer(id, remaining = TOAST_DURATION) {
  clearDismissTimer(id);
  const expiresAt = Date.now() + remaining;
  const timeout = setTimeout(() => {
    dismissTimers.delete(id);
    dispatch({ type: actionTypes.DISMISS_TOAST, toastId: id });
  }, remaining);
  dismissTimers.set(id, { timeout, expiresAt, remaining });
}

function clearDismissTimer(id) {
  const t = dismissTimers.get(id);
  if (t?.timeout) clearTimeout(t.timeout);
  dismissTimers.delete(id);
}

export function pauseToast(id) {
  const t = dismissTimers.get(id);
  if (!t || !t.timeout) return;
  clearTimeout(t.timeout);
  const remaining = Math.max(0, t.expiresAt - Date.now());
  dismissTimers.set(id, { timeout: null, expiresAt: t.expiresAt, remaining });
}

export function resumeToast(id) {
  const t = dismissTimers.get(id);
  if (!t || t.timeout) return;
  startDismissTimer(id, t.remaining);
}

export const reducer = (state, action) => {
  switch (action.type) {
    case actionTypes.ADD_TOAST:
      return {
        ...state,
        toasts: [action.toast, ...state.toasts].slice(0, TOAST_LIMIT),
      };

    case actionTypes.UPDATE_TOAST:
      return {
        ...state,
        toasts: state.toasts.map((t) =>
          t.id === action.toast.id ? { ...t, ...action.toast } : t
        ),
      };

    case actionTypes.DISMISS_TOAST: {
      const { toastId } = action;

      if (toastId) {
        addToRemoveQueue(toastId);
      } else {
        state.toasts.forEach((toast) => {
          addToRemoveQueue(toast.id);
        });
      }

      return {
        ...state,
        toasts: state.toasts.map((t) =>
          t.id === toastId || toastId === undefined
            ? {
                ...t,
                open: false,
              }
            : t
        ),
      };
    }
    case actionTypes.REMOVE_TOAST:
      if (action.toastId === undefined) {
        return {
          ...state,
          toasts: [],
        };
      }
      return {
        ...state,
        toasts: state.toasts.filter((t) => t.id !== action.toastId),
      };
  }
};

const listeners = [];

let memoryState = { toasts: [] };

function dispatch(action) {
  memoryState = reducer(memoryState, action);
  listeners.forEach((listener) => {
    listener(memoryState);
  });
}

function toast({ ...props }) {
  const id = genId();

  const update = (props) =>
    dispatch({
      type: actionTypes.UPDATE_TOAST,
      toast: { ...props, id },
    });

  const dismiss = () => {
    clearDismissTimer(id);
    dispatch({ type: actionTypes.DISMISS_TOAST, toastId: id });
  };

  dispatch({
    type: actionTypes.ADD_TOAST,
    toast: {
      ...props,
      id,
      open: true,
      onOpenChange: (open) => {
        if (!open) dismiss();
      },
    },
  });

  startDismissTimer(id, TOAST_DURATION);

  return {
    id,
    dismiss,
    update,
  };
}

function useToast() {
  const [state, setState] = useState(memoryState);

  useEffect(() => {
    listeners.push(setState);
    return () => {
      const index = listeners.indexOf(setState);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    };
  }, [state]);

  return {
    ...state,
    toast,
    dismiss: (toastId) => {
      clearDismissTimer(toastId);
      dispatch({ type: actionTypes.DISMISS_TOAST, toastId });
    },
  };
}

export { useToast, toast };