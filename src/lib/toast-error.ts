import { toast } from '@/components/ui/use-toast';

export function toastError(title: string, e: unknown) {
  toast({
    title,
    description: e instanceof Error ? e.message : String(e),
    variant: 'destructive',
  });
}
