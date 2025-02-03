import { cn } from "@/lib/utils";

export function LoadingDots({ className }: { className?: string }) {
  return (
    <div className={cn("flex space-x-1", className)}>
      <div className="w-2 h-2 rounded-full bg-current animate-[loading_0.8s_ease-in-out_infinite]" />
      <div className="w-2 h-2 rounded-full bg-current animate-[loading_0.8s_ease-in-out_0.2s_infinite]" />
      <div className="w-2 h-2 rounded-full bg-current animate-[loading_0.8s_ease-in-out_0.4s_infinite]" />
    </div>
  );
} 