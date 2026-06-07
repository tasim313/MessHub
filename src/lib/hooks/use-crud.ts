/**
 * Unified CRUD Hook for ERP Operations
 * Provides consistent form handling, validation, and duplicate prevention
 */
import { useState, useCallback } from "react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth-context";
import { addDocTo, updateDocIn, deleteDocFrom } from "@/lib/data";
import { submitChangeRequest } from "@/lib/workflow";

interface CRUDOptions<T> {
  collectionName: string;
  /** Initial form state */
  initialForm: T;
  /** Validation function - returns error message or null if valid */
  validate?: (form: T) => string | null;
  /** Check for duplicate before create - returns true if duplicate exists */
  checkDuplicate?: (form: T) => Promise<boolean>;
  /** Transform form data before saving */
  transform?: (form: T) => T;
}

interface CRUDReturn<T> {
  form: T;
  setForm: (form: T) => void;
  open: boolean;
  setOpen: (open: boolean) => void;
  editing: T | null;
  setEditing: (item: T | null) => void;
  reset: () => void;
  startEdit: (item: T) => void;
  onSubmit: (e: React.FormEvent) => Promise<void>;
  onDelete: (item: T) => Promise<void>;
  isSubmitting: boolean;
}

/**
 * Hook for handling CRUD operations with consistent workflow
 */
export function useCRUD<T extends { id?: string; name?: string }>(
  options: CRUDOptions<T>
): CRUDReturn<T> {
  const { profile } = useAuth();
  const [form, setForm] = useState<T>(options.initialForm);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<T | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const reset = useCallback(() => {
    setForm(options.initialForm);
    setEditing(null);
  }, [options.initialForm]);

  const startEdit = useCallback((item: T) => {
    setEditing(item);
    setForm({ ...item });
    setOpen(true);
  }, []);

  const onSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate
    if (options.validate) {
      const error = options.validate(form);
      if (error) {
        toast.error(error);
        return;
      }
    }

    // Check for duplicate
    if (options.checkDuplicate && !editing) {
      const isDuplicate = await options.checkDuplicate(form);
      if (isDuplicate) {
        toast.error("This record already exists");
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const payload = options.transform ? options.transform(form) : { ...form };
      
      if (profile?.role === "owner" && editing) {
        await updateDocIn(options.collectionName, editing.id!, payload);
        toast.success(`${options.collectionName.slice(0, -1)} updated`);
      } else if (profile?.role === "owner") {
        await addDocTo(options.collectionName, { ...payload, createdAt: Date.now() } as T & { createdAt: number });
        toast.success(`${options.collectionName.slice(0, -1)} added`);
      } else if (profile) {
        await submitChangeRequest({
          collectionName: options.collectionName,
          action: editing ? "update" : "create",
          title: `${editing ? "Update" : "Add"} ${options.collectionName.slice(0, -1)} ${form.name || ""}`,
          actor: { uid: profile.uid, name: profile.name, role: profile.role },
          targetId: editing?.id,
          payload: editing ? payload : { ...payload, createdAt: Date.now() },
          previousData: editing || null,
        });
        toast.success("Request sent to admin for approval");
      }
      
      setOpen(false);
      reset();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setIsSubmitting(false);
    }
  }, [form, editing, profile, options, reset]);

  const onDelete = useCallback(async (item: T) => {
    if (!profile) return;
    
    if (!confirm(`Delete ${item.name || "this item"}?`)) return;
    
    try {
      if (profile.role === "owner") {
        await deleteDocFrom(options.collectionName, item.id!);
        toast.success("Deleted");
      } else {
        await submitChangeRequest({
          collectionName: options.collectionName,
          action: "delete",
          title: `Delete ${options.collectionName.slice(0, -1)} ${item.name || ""}`,
          actor: { uid: profile.uid, name: profile.name, role: profile.role },
          targetId: item.id,
          previousData: item,
        });
        toast.success("Delete request sent to admin");
      }
    } catch (err) {
      toast.error((err as Error).message);
    }
  }, [profile, options.collectionName]);

  return {
    form,
    setForm,
    open,
    setOpen,
    editing,
    setEditing,
    reset,
    startEdit,
    onSubmit,
    onDelete,
    isSubmitting,
  };
}