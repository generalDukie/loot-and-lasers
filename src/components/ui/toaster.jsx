import { useToast, pauseToast, resumeToast } from "@/components/ui/use-toast";
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "@/components/ui/toast";

export function Toaster() {
  const { toasts, dismiss } = useToast();

  return (
    <ToastProvider>
      {toasts.map(function ({ id, title, description, action, open, ...props }) {
        return (
          <Toast
            key={id}
            {...props}
            data-state={open === false ? "closed" : "open"}
            onMouseEnter={() => pauseToast(id)}
            onMouseLeave={() => resumeToast(id)}
            className={open === false ? "pointer-events-none" : undefined}
          >
            <div className="grid gap-1">
              {title && <ToastTitle>{title}</ToastTitle>}
              {description && (
                <ToastDescription>{description}</ToastDescription>
              )}
            </div>
            {action}
            <ToastClose onClick={() => dismiss(id)} />
          </Toast>
        );
      })}
      <ToastViewport />
    </ToastProvider>
  );
}